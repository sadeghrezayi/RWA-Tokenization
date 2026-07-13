import { InvalidTransferError } from "./errors.js";

// FR-TR-1: an executed compliant transfer of an asset's tokens between two
// platform holders. On-chain compliance (ERC-3643) is the real enforcement;
// this record feeds the holder registry + audit trail. tokens are whole units.
export interface RecordTransferFields {
  id: string;
  assetId: string;
  tokenAddress: string;
  fromInvestorId: string;
  toInvestorId: string;
  tokens: bigint;
  executedAt: Date;
}

export class TokenTransfer {
  private constructor(
    public readonly id: string,
    public readonly assetId: string,
    public readonly tokenAddress: string,
    public readonly fromInvestorId: string,
    public readonly toInvestorId: string,
    public readonly tokens: bigint,
    public readonly executedAt: Date,
  ) {}

  static record(fields: RecordTransferFields): TokenTransfer {
    if (fields.tokens <= 0n) {
      throw new InvalidTransferError("a transfer amount must be positive");
    }
    if (fields.fromInvestorId === fields.toInvestorId) {
      throw new InvalidTransferError("cannot transfer to the same holder");
    }
    return new TokenTransfer(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.fromInvestorId,
      fields.toInvestorId,
      fields.tokens,
      fields.executedAt,
    );
  }
}
