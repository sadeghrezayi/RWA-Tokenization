import { Contract, HDNodeWallet, JsonRpcProvider, NonceManager } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import type { PrismaClient } from "@prisma/client";

// ISO 3166-1 numeric code recorded on registry entries (deployment context).
export const COUNTRY_IR = 364;

// Custodial wallets (FR-CU-1) live on a separate HD account (account 1) so
// investor indices can never collide with the operator key (account 0).
export const investorWalletPath = (index: number) => `m/44'/60'/1'/0/${String(index)}`;

export const REGISTRY_ABI = [
  "function contains(address wallet) view returns (bool)",
  "function registerIdentity(address wallet, address identity, uint16 country)",
];

export type RegistryContract = Contract & {
  contains(wallet: string): Promise<boolean>;
  registerIdentity(
    wallet: string,
    identity: string,
    country: number,
  ): Promise<ContractTransactionResponse>;
};

// A FRESH manager per call, deliberately.
//
// An ethers NonceManager caches the next nonce and only advances it when IT
// sends. Hold one for longer than a single operation and another adapter's
// transaction moves the chain on while yours stands still — the next send is
// then rejected with "nonce has already been used". That is not theoretical:
// it is the bug that failed CI seven times, from the claim issuer keeping one
// for the life of the process (see the 2026-08-11 entry in
// docs/open-product-decisions.md). Every adapter takes one per operation.
//
// Sharing ONE manager across adapters was tried as a fix and reverted: it
// allocates optimistically, so a send that never reaches the chain leaves a gap
// and later transactions queue behind it forever. Measured across full
// integration runs: shared -> a chain suite hung for 900s; shared behind a
// serialised send lane -> the same; per-call -> clean.
//
// STILL OPEN, and genuinely a concurrency problem: two sends issued in the same
// instant can read the same nonce. The fix is a serialised send queue per
// account (one in flight, nonce read fresh), which is its own slice.
export const operatorSigner = (rpcUrl: string, mnemonic: string): NonceManager =>
  new NonceManager(HDNodeWallet.fromPhrase(mnemonic).connect(new JsonRpcProvider(rpcUrl)));

// The derived signing key for an investor's custodial wallet (platform-held).
export const investorSigner = (
  rpcUrl: string,
  mnemonic: string,
  derivationIndex: number,
): HDNodeWallet =>
  HDNodeWallet.fromPhrase(mnemonic, undefined, investorWalletPath(derivationIndex)).connect(
    new JsonRpcProvider(rpcUrl),
  );

// Looks up an investor's custodial wallet without creating one.
export const lookupWallet = (
  prisma: PrismaClient,
  investorId: string,
): Promise<{ address: string; derivationIndex: number } | null> =>
  prisma.investorWallet
    .findFirst({ where: { investorId } })
    .then((row) => (row && !row.address.startsWith("pending:") ? row : null));

// Gets or derives+persists the investor's custodial wallet address.
export const resolveWallet = async (
  prisma: PrismaClient,
  mnemonic: string,
  investorId: string,
): Promise<{ address: string; derivationIndex: number }> => {
  const existing = await prisma.investorWallet.findFirst({ where: { investorId } });
  if (existing && !existing.address.startsWith("pending:")) {
    return existing;
  }
  const row =
    existing ??
    (await prisma.investorWallet.create({
      data: { investorId, address: `pending:${investorId}` },
    }));
  const address = HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    investorWalletPath(row.derivationIndex),
  ).address;
  await prisma.investorWallet.updateMany({ where: { investorId }, data: { address } });
  return { address, derivationIndex: row.derivationIndex };
};

// Registers the wallet with the token's identity registry when the investor
// has an ONCHAINID (KYC'd). Without one, registration is skipped on purpose —
// the ERC-3643 token itself will reject transfers to the unverified wallet.
export const ensureRegistered = async (
  prisma: PrismaClient,
  registry: RegistryContract,
  investorId: string,
  wallet: string,
): Promise<void> => {
  const identity = await prisma.onchainIdentity.findFirst({ where: { investorId } });
  if (!identity) {
    return;
  }
  if (!(await registry.contains(wallet))) {
    await (await registry.registerIdentity(wallet, identity.address, COUNTRY_IR)).wait();
  }
};
