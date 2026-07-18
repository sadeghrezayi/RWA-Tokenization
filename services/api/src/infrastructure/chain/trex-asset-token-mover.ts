import { Contract, parseEther } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import type { PrismaClient } from "@prisma/client";
import type { AssetTokenTransferrer } from "../../application/transfers/ports.js";
import type { AssetTokenBurner } from "../../application/redemptions/ports.js";
import type { OnchainidConfig } from "./onchainid-claim-issuer.js";
import {
  ensureRegistered,
  investorSigner,
  lookupWallet,
  operatorSigner,
  resolveWallet,
  REGISTRY_ABI,
} from "./custodial-wallets.js";
import type { RegistryContract } from "./custodial-wallets.js";

const TOKEN_ABI = [
  "function identityRegistry() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function burn(address userAddress, uint256 amount)",
];

type TokenContract = Contract & {
  identityRegistry(): Promise<string>;
  balanceOf(wallet: string): Promise<bigint>;
  transfer(to: string, amount: bigint): Promise<ContractTransactionResponse>;
  burn(userAddress: string, amount: bigint): Promise<ContractTransactionResponse>;
};

// Gas top-up for custodial wallets on the devnet. Irrelevant economics (test
// chain now, gas-free permissioned Besu later — D2); just enough to transact.
const GAS_FLOOR = parseEther("0.005");
const GAS_TOPUP = parseEther("0.05");

// FR-TR: moves and burns asset tokens.
// Transfers are signed by the SENDER's custodial wallet and go through the
// regular ERC-3643 `transfer` — so identity verification AND compliance run
// on-chain for real (golden-path step 6: a non-compliant transfer reverts).
// Burns are agent-only (operator), used by redemption after review.
export class TrexAssetTokenMover implements AssetTokenTransferrer, AssetTokenBurner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: OnchainidConfig,
  ) {}

  async balanceOf(tokenAddress: string, investorId: string): Promise<bigint> {
    const wallet = await lookupWallet(this.prisma, investorId);
    if (!wallet) {
      return 0n;
    }
    const token = new Contract(
      tokenAddress,
      TOKEN_ABI,
      operatorSigner(this.config.rpcUrl, this.config.operatorMnemonic),
    ) as TokenContract;
    return token.balanceOf(wallet.address);
  }

  async transfer(
    tokenAddress: string,
    fromInvestorId: string,
    toInvestorId: string,
    tokens: bigint,
  ): Promise<void> {
    const from = await lookupWallet(this.prisma, fromInvestorId);
    if (!from) {
      throw new Error(`investor ${fromInvestorId} has no custodial wallet holding tokens`);
    }
    const to = await resolveWallet(this.prisma, this.config.operatorMnemonic, toInvestorId);

    const operator = operatorSigner(this.config.rpcUrl, this.config.operatorMnemonic);
    const readToken = new Contract(tokenAddress, TOKEN_ABI, operator) as TokenContract;

    // Register the recipient when they hold a KYC identity; if they do not,
    // registration is skipped and the token itself rejects the transfer.
    const registry = new Contract(
      await readToken.identityRegistry(),
      REGISTRY_ABI,
      operator,
    ) as RegistryContract;
    await ensureRegistered(this.prisma, registry, toInvestorId, to.address);

    // The platform holds the sender's key (FR-CU-1): fund gas if needed, then
    // sign the regular transfer AS the sender.
    const sender = investorSigner(
      this.config.rpcUrl,
      this.config.operatorMnemonic,
      from.derivationIndex,
    );
    const provider = sender.provider;
    if (provider && (await provider.getBalance(sender.address)) < GAS_FLOOR) {
      await (await operator.sendTransaction({ to: sender.address, value: GAS_TOPUP })).wait();
    }
    const token = new Contract(tokenAddress, TOKEN_ABI, sender) as TokenContract;
    await (await token.transfer(to.address, tokens)).wait();
  }

  async burn(tokenAddress: string, investorId: string, tokens: bigint): Promise<void> {
    const wallet = await lookupWallet(this.prisma, investorId);
    if (!wallet) {
      throw new Error(`investor ${investorId} has no custodial wallet to burn from`);
    }
    const token = new Contract(
      tokenAddress,
      TOKEN_ABI,
      operatorSigner(this.config.rpcUrl, this.config.operatorMnemonic),
    ) as TokenContract;
    await (await token.burn(wallet.address, tokens)).wait();
  }
}
