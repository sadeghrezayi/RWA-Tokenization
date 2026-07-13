import type { TokenTransfer } from "../../domain/transfers/token-transfer.js";
import type { TransferRepository } from "./ports.js";

export interface TransferView {
  id: string;
  assetId: string;
  tokenAddress: string;
  fromInvestorId: string;
  toInvestorId: string;
  tokens: string;
  executedAt: string;
}

export const toTransferView = (t: TokenTransfer): TransferView => ({
  id: t.id,
  assetId: t.assetId,
  tokenAddress: t.tokenAddress,
  fromInvestorId: t.fromInvestorId,
  toInvestorId: t.toInvestorId,
  tokens: String(t.tokens),
  executedAt: t.executedAt.toISOString(),
});

export class ListTransfers {
  constructor(private readonly transfers: TransferRepository) {}

  async executeForAsset(input: { assetId: string }): Promise<TransferView[]> {
    return (await this.transfers.findByAsset(input.assetId)).map(toTransferView);
  }

  async executeForInvestor(input: { investorId: string }): Promise<TransferView[]> {
    return (await this.transfers.findByInvestor(input.investorId)).map(toTransferView);
  }
}
