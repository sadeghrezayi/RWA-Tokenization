import type { PrismaClient, Redemption as RedemptionRow } from "@prisma/client";
import { Redemption } from "../../domain/redemptions/redemption.js";
import type { RedemptionRepository } from "../../application/redemptions/ports.js";

export class PrismaRedemptionRepository implements RedemptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Redemption | undefined> {
    const row = await this.prisma.redemption.findFirst({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<Redemption[]> {
    const rows = await this.prisma.redemption.findMany({ orderBy: { requestedAt: "desc" } });
    return rows.map(toDomain);
  }

  async findByInvestor(investorId: string): Promise<Redemption[]> {
    const rows = await this.prisma.redemption.findMany({
      where: { investorId },
      orderBy: { requestedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async save(redemption: Redemption): Promise<void> {
    const data = {
      assetId: redemption.assetId,
      tokenAddress: redemption.tokenAddress,
      investorId: redemption.investorId,
      tokens: redemption.tokens,
      state: redemption.state,
      requestedAt: redemption.requestedAt,
      payoutRial: redemption.payoutRial ?? null,
      rejectionReason: redemption.rejectionReason ?? null,
      resolvedAt: redemption.resolvedAt ?? null,
    };
    // Tenant-safe pattern (no upsert): try update first, create when absent.
    const updated = await this.prisma.redemption.updateMany({
      where: { id: redemption.id },
      data,
    });
    if (updated.count === 0) {
      await this.prisma.redemption.create({ data: { id: redemption.id, ...data } });
    }
  }
}

const toDomain = (row: RedemptionRow): Redemption =>
  Redemption.restore({
    id: row.id,
    assetId: row.assetId,
    tokenAddress: row.tokenAddress,
    investorId: row.investorId,
    tokens: row.tokens,
    state: row.state,
    requestedAt: row.requestedAt,
    ...(row.payoutRial !== null ? { payoutRial: row.payoutRial } : {}),
    ...(row.rejectionReason !== null ? { rejectionReason: row.rejectionReason } : {}),
    ...(row.resolvedAt !== null ? { resolvedAt: row.resolvedAt } : {}),
  });
