import type { TokenTransfer } from "../../domain/transfers/token-transfer.js";

export interface TransferRepository {
  save(transfer: TokenTransfer): Promise<void>;
  findByAsset(assetId: string): Promise<TokenTransfer[]>;
  findByInvestor(investorId: string): Promise<TokenTransfer[]>;
}

// FR-TR-1: executes a compliant transfer on the asset's ERC-3643 token. The
// adapter (operator as agent) moves tokens between custodial wallets; on-chain
// compliance is enforced there — an ineligible recipient reverts.
export interface AssetTokenTransferrer {
  balanceOf(tokenAddress: string, investorId: string): Promise<bigint>;
  transfer(
    tokenAddress: string,
    fromInvestorId: string,
    toInvestorId: string,
    tokens: bigint,
  ): Promise<void>;
}
