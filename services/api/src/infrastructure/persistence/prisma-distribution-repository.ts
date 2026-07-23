import type {
  Distribution as DistributionRow,
  DistributionPayout as PayoutRow,
  PrismaClient,
} from "@prisma/client";
import { Distribution } from "../../domain/distributions/distribution.js";
import type { DistributionRepository } from "../../application/distributions/ports.js";

type FullRow = DistributionRow & { payouts: PayoutRow[] };

export class PrismaDistributionRepository implements DistributionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Distribution | undefined> {
    const row = await this.prisma.distribution.findFirst({ where: { id }, include: INCLUDE });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<Distribution[]> {
    const rows = await this.prisma.distribution.findMany({
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(distribution: Distribution): Promise<void> {
    const data = {
      assetId: distribution.assetId,
      tokenAddress: distribution.tokenAddress,
      totalAmountRial: distribution.totalAmountRial,
      state: distribution.state,
    };
    // Tenant-safe pattern (no upsert): probe, then create or updateMany.
    const exists = await this.prisma.distribution.findFirst({ where: { id: distribution.id } });
    await this.prisma.$transaction([
      exists
        ? this.prisma.distribution.updateMany({ where: { id: distribution.id }, data })
        : this.prisma.distribution.create({ data: { id: distribution.id, ...data } }),
      this.prisma.distributionPayout.deleteMany({ where: { distributionId: distribution.id } }),
      this.prisma.distributionPayout.createMany({
        data: distribution.payouts.map((p) => ({
          distributionId: distribution.id,
          investorId: p.investorId,
          tokens: p.tokens,
          amountRial: p.amountRial,
        })),
      }),
    ]);
  }
}

const INCLUDE = { payouts: { orderBy: { id: "asc" } } } as const;

const toDomain = (row: FullRow): Distribution =>
  Distribution.restore({
    id: row.id,
    assetId: row.assetId,
    tokenAddress: row.tokenAddress,
    totalAmountRial: row.totalAmountRial,
    state: row.state,
    payouts: row.payouts.map((p) => ({
      investorId: p.investorId,
      tokens: p.tokens,
      amountRial: p.amountRial,
    })),
  });
