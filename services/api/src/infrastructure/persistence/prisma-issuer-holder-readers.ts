import type { PrismaClient } from "@prisma/client";
import type {
  IssuerAllocationReader,
  IssuerAllocationRow,
} from "../../application/issuers/issuer-asset-holders.js";

// P1-2: the two small reads behind an issuer's holder registry.
//
// Both take the TENANT-SCOPED client, so an issuer can never be shown a holder
// from another tenant even if an asset id were guessed.

export class PrismaIssuerAllocationReader implements IssuerAllocationReader {
  constructor(private readonly prisma: PrismaClient) {}

  async forAsset(assetId: string): Promise<IssuerAllocationRow[]> {
    // Through the offering, because an allocation belongs to a raise and an
    // asset can raise more than once — the use case sums them per investor.
    const rows = await this.prisma.offeringAllocation.findMany({
      where: { offering: { assetId }, allocated: { gt: 0n } },
      select: {
        investorId: true,
        allocated: true,
        costRial: true,
        refundRial: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      investorId: row.investorId,
      allocated: row.allocated,
      costRial: row.costRial,
      refundRial: row.refundRial,
      at: row.createdAt,
    }));
  }
}

// Which issuer organisation brought an asset. `undefined` means the PLATFORM
// onboarded it — the column is nullable on purpose (3.3) — and the use case
// treats that as "no issuer may see this", never as "unrestricted".
export class PrismaAssetOwnerReader {
  constructor(private readonly prisma: PrismaClient) {}

  async organisationOf(assetId: string): Promise<string | undefined> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId },
      select: { organisationId: true },
    });
    return asset?.organisationId ?? undefined;
  }
}
