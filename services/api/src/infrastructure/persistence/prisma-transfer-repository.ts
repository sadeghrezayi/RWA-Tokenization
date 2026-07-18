import type { PrismaClient, TokenTransfer as TransferRow } from "@prisma/client";
import { TokenTransfer } from "../../domain/transfers/token-transfer.js";
import type { TransferRepository } from "../../application/transfers/ports.js";

export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(transfer: TokenTransfer): Promise<void> {
    await this.prisma.tokenTransfer.create({
      data: {
        id: transfer.id,
        assetId: transfer.assetId,
        tokenAddress: transfer.tokenAddress,
        fromInvestorId: transfer.fromInvestorId,
        toInvestorId: transfer.toInvestorId,
        tokens: transfer.tokens,
        executedAt: transfer.executedAt,
      },
    });
  }

  async findByAsset(assetId: string): Promise<TokenTransfer[]> {
    const rows = await this.prisma.tokenTransfer.findMany({
      where: { assetId },
      orderBy: { executedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findByInvestor(investorId: string): Promise<TokenTransfer[]> {
    const rows = await this.prisma.tokenTransfer.findMany({
      where: { OR: [{ fromInvestorId: investorId }, { toInvestorId: investorId }] },
      orderBy: { executedAt: "desc" },
    });
    return rows.map(toDomain);
  }
}

const toDomain = (row: TransferRow): TokenTransfer =>
  TokenTransfer.record({
    id: row.id,
    assetId: row.assetId,
    tokenAddress: row.tokenAddress,
    fromInvestorId: row.fromInvestorId,
    toInvestorId: row.toInvestorId,
    tokens: row.tokens,
    executedAt: row.executedAt,
  });
