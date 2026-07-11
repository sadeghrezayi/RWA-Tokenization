import type {
  Offering as OfferingRow,
  OfferingAllocation as AllocationRow,
  OfferingSubscription as SubscriptionRow,
  PrismaClient,
} from "@prisma/client";
import { Offering } from "../../domain/offerings/offering.js";
import type { OfferingRepository } from "../../application/offerings/ports.js";

type FullRow = OfferingRow & { subscriptions: SubscriptionRow[]; allocations: AllocationRow[] };

export class PrismaOfferingRepository implements OfferingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Offering | undefined> {
    const row = await this.prisma.offering.findUnique({ where: { id }, include: INCLUDE });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<Offering[]> {
    const rows = await this.prisma.offering.findMany({
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(offering: Offering): Promise<void> {
    const data = {
      assetId: offering.assetId,
      tokenAddress: offering.tokenAddress,
      supply: offering.supply,
      priceRial: offering.priceRial,
      minPerInvestor: offering.minPerInvestor,
      maxPerInvestor: offering.maxPerInvestor,
      minimumRaise: offering.minimumRaise,
      opensAt: offering.opensAt,
      closesAt: offering.closesAt,
      state: offering.state,
    };
    await this.prisma.$transaction([
      this.prisma.offering.upsert({
        where: { id: offering.id },
        create: { id: offering.id, ...data },
        update: data,
      }),
      this.prisma.offeringSubscription.deleteMany({ where: { offeringId: offering.id } }),
      this.prisma.offeringSubscription.createMany({
        data: offering.subscriptions.map((s) => ({
          offeringId: offering.id,
          investorId: s.investorId,
          tokens: s.tokens,
        })),
      }),
      this.prisma.offeringAllocation.deleteMany({ where: { offeringId: offering.id } }),
      this.prisma.offeringAllocation.createMany({
        data: (offering.allocations ?? []).map((a) => ({
          offeringId: offering.id,
          investorId: a.investorId,
          requested: a.requested,
          allocated: a.allocated,
          costRial: a.costRial,
          refundRial: a.refundRial,
        })),
      }),
    ]);
  }
}

const INCLUDE = {
  subscriptions: { orderBy: { id: "asc" } },
  allocations: { orderBy: { id: "asc" } },
} as const;

const toDomain = (row: FullRow): Offering =>
  Offering.restore({
    id: row.id,
    assetId: row.assetId,
    tokenAddress: row.tokenAddress,
    supply: row.supply,
    priceRial: row.priceRial,
    minPerInvestor: row.minPerInvestor,
    maxPerInvestor: row.maxPerInvestor,
    minimumRaise: row.minimumRaise,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    state: row.state,
    subscriptions: row.subscriptions.map((s) => ({
      investorId: s.investorId,
      tokens: s.tokens,
    })),
    allocations:
      row.state === "closed_success" || row.state === "closed_failed"
        ? row.allocations.map((a) => ({
            investorId: a.investorId,
            requested: a.requested,
            allocated: a.allocated,
            costRial: a.costRial,
            refundRial: a.refundRial,
          }))
        : undefined,
  });
