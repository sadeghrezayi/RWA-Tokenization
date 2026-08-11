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

// A FRESH nonce manager per send, and only one send per account at a time.
//
// Two rules, each earned the hard way:
//
// FRESH, because an ethers NonceManager only advances its cached nonce when IT
// sends. Hold one beyond a single operation and another adapter's transaction
// moves the chain on while yours stands still — the next send is rejected with
// "nonce has already been used". That was the claim-issuer bug behind seven CI
// failures (2026-08-11 in docs/open-product-decisions.md).
//
// ONE AT A TIME, because two sends issued in the same instant both read the
// same nonce before either lands, and the loser is rejected the same way.
//
// The lane is the ONLY thing shared. Sharing a NonceManager instead was tried
// twice and reverted: it allocates optimistically, so a send that never reaches
// the chain leaves a gap and everything after it queues forever — measured, a
// chain suite hung for 900s. Nothing here can go stale or wedge: a failed send
// leaves no state behind, and the next one re-reads the chain.
const lanes = new Map<string, Promise<unknown>>();

class LanedOperatorSigner extends NonceManager {
  constructor(
    signer: HDNodeWallet,
    private readonly lane: string,
  ) {
    super(signer);
  }

  override async sendTransaction(
    tx: Parameters<NonceManager["sendTransaction"]>[0],
  ): Promise<Awaited<ReturnType<NonceManager["sendTransaction"]>>> {
    const queued = (lanes.get(this.lane) ?? Promise.resolve()).then(async () =>
      // No reset here: this manager reads the chain once and then increments
      // locally for its OWN sends. Forcing a re-read per send hits ethers'
      // 250ms RPC cache, so two rapid sends get the same count back and the
      // second is rejected "nonce too low" — which is what a local increment
      // exists to prevent.
      super.sendTransaction(tx),
    );
    // A failure must not stop the queue for everyone behind it.
    lanes.set(
      this.lane,
      queued.then(
        () => undefined,
        () => undefined,
      ),
    );
    return queued;
  }
}

export const operatorSigner = (rpcUrl: string, mnemonic: string): NonceManager =>
  new LanedOperatorSigner(
    HDNodeWallet.fromPhrase(mnemonic).connect(new JsonRpcProvider(rpcUrl)),
    `${rpcUrl}|${mnemonic}`,
  );

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
