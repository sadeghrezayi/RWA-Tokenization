import { Contract, HDNodeWallet, JsonRpcProvider, NonceManager } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import type { PrismaClient } from "@prisma/client";
import type { AssetTokenIssuer } from "../../application/offerings/ports.js";
import type { OnchainidConfig } from "./onchainid-claim-issuer.js";

const TOKEN_ABI = [
  "function identityRegistry() view returns (address)",
  "function mint(address to, uint256 amount)",
  "function paused() view returns (bool)",
  "function unpause()",
];

const REGISTRY_ABI = [
  "function contains(address wallet) view returns (bool)",
  "function registerIdentity(address wallet, address identity, uint16 country)",
];

// ISO 3166-1 numeric code recorded on registry entries (deployment context).
const COUNTRY_IR = 364;

// Custodial wallets (FR-CU-1) live on a separate HD account (account 1) so
// investor indices can never collide with the operator key (account 0).
const investorWalletPath = (index: number) => `m/44'/60'/1'/0/${String(index)}`;

type TokenContract = Contract & {
  identityRegistry(): Promise<string>;
  paused(): Promise<boolean>;
  mint(to: string, amount: bigint): Promise<ContractTransactionResponse>;
  unpause(): Promise<ContractTransactionResponse>;
};

type RegistryContract = Contract & {
  contains(wallet: string): Promise<boolean>;
  registerIdentity(
    wallet: string,
    identity: string,
    country: number,
  ): Promise<ContractTransactionResponse>;
};

// FR-PI-3 minting: derives the investor's custodial wallet, registers it with
// the per-asset identity registry (bound to the investor's ONCHAINID, whose
// KYC claim makes it verified), and mints. T-REX mint requires the token to be
// unpaused, so issuance unpauses lazily before the first mint.
export class TrexAssetTokenIssuer implements AssetTokenIssuer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: OnchainidConfig,
  ) {}

  async mint(tokenAddress: string, investorId: string, tokens: bigint): Promise<void> {
    const operator = this.operator();
    const token = new Contract(tokenAddress, TOKEN_ABI, operator) as TokenContract;
    await this.ensureUnpaused(token);

    const wallet = await this.walletFor(investorId);
    const identity = await this.prisma.onchainIdentity.findFirst({ where: { investorId } });
    if (!identity) {
      throw new Error(
        `investor ${investorId} has no on-chain identity — the KYC claim must be issued first`,
      );
    }

    const registryAddress = await token.identityRegistry();
    const registry = new Contract(registryAddress, REGISTRY_ABI, operator) as RegistryContract;
    if (!(await registry.contains(wallet))) {
      await (await registry.registerIdentity(wallet, identity.address, COUNTRY_IR)).wait();
    }
    await (await token.mint(wallet, tokens)).wait();
  }

  async finalize(tokenAddress: string): Promise<void> {
    const token = new Contract(tokenAddress, TOKEN_ABI, this.operator()) as TokenContract;
    await this.ensureUnpaused(token);
  }

  async walletAddressOf(investorId: string): Promise<string | undefined> {
    const row = await this.prisma.investorWallet.findFirst({ where: { investorId } });
    return row?.address;
  }

  private async ensureUnpaused(token: TokenContract): Promise<void> {
    if (await token.paused()) {
      await (await token.unpause()).wait();
    }
  }

  private async walletFor(investorId: string): Promise<string> {
    const existing = await this.prisma.investorWallet.findFirst({ where: { investorId } });
    if (existing && !existing.address.startsWith("pending:")) {
      return existing.address;
    }
    const row =
      existing ??
      (await this.prisma.investorWallet.create({
        data: { investorId, address: `pending:${investorId}` },
      }));
    const address = HDNodeWallet.fromPhrase(
      this.config.operatorMnemonic,
      undefined,
      investorWalletPath(row.derivationIndex),
    ).address;
    await this.prisma.investorWallet.updateMany({ where: { investorId }, data: { address } });
    return address;
  }

  private operator(): NonceManager {
    const provider = new JsonRpcProvider(this.config.rpcUrl);
    return new NonceManager(
      HDNodeWallet.fromPhrase(this.config.operatorMnemonic).connect(provider),
    );
  }
}
