import type {
  Asset as AssetRow,
  AssetDocument as DocRow,
  AssetRight as RightRow,
  PrismaClient,
} from "@prisma/client";
import { Asset } from "../../domain/assets/asset.js";
import type { AssetType } from "../../domain/assets/asset.js";
import { CustodyArrangement } from "../../domain/assets/custody-arrangement.js";
import { DossierDocument, LegalDossier } from "../../domain/assets/legal-dossier.js";
import type {
  DocumentReview,
  DocumentReviewState,
  DossierDocumentKind,
} from "../../domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../domain/assets/onboarding-checklist.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import { RealEstateProfile } from "../../domain/assets/real-estate-profile.js";
import type { PropertyType } from "../../domain/assets/real-estate-profile.js";
import { RightsMatrix } from "../../domain/assets/rights-matrix.js";
import type { RightKind } from "../../domain/assets/rights-matrix.js";
import type { AssetEvent, AssetEventLog, AssetRepository } from "../../application/assets/ports.js";
import type { AssetEventReader, RecordedAssetEvent } from "../../application/reporting/ports.js";

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Asset | undefined> {
    const row = await this.prisma.asset.findFirst({
      where: { id },
      include: { documents: true, rights: true },
    });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({
      include: { documents: true, rights: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(asset: Asset): Promise<void> {
    const data = {
      name: asset.name,
      type: asset.type,
      state: asset.state,
      custodianName: asset.custody?.custodianName ?? null,
      custodyLocation: asset.custody?.location ?? null,
      tokenAddress: asset.tokenAddress ?? null,
      checklist: asset.checklist.confirmedItems(),
      addressLine: asset.realEstate?.addressLine ?? null,
      city: asset.realEstate?.city ?? null,
      propertyType: asset.realEstate?.propertyType ?? null,
      areaSquareMetres: asset.realEstate?.areaSquareMetres ?? null,
      titleReference: asset.realEstate?.titleReference ?? null,
      builtInYear: asset.realEstate?.builtInYear ?? null,
      // 3.3: who brought the asset. NULL means the platform onboarded it.
      organisationId: asset.organisationId ?? null,
    };
    const rights = asset.rights.conveyed().map((right) => ({
      assetId: asset.id,
      kind: right.kind,
      note: right.note,
    }));
    const documents = asset.dossier.documents.map((d) => ({
      assetId: asset.id,
      kind: d.kind,
      title: d.title,
      cid: d.cid,
      sha256: d.sha256,
      investorVisible: d.investorVisible,
      // 4.3: carried explicitly. Dropping these would make every document read
      // as unreviewed on reload, which now blocks approval outright.
      reviewState: d.review.state,
      reviewedBy: d.review.reviewedBy ?? null,
      reviewedAt: d.review.reviewedAt ?? null,
      reviewReason: d.review.reason ?? null,
    }));
    // Full-state save: replace the document set atomically with the asset row.
    // Tenant-safe pattern (no upsert): probe, then create or updateMany.
    const exists = await this.prisma.asset.findFirst({ where: { id: asset.id } });
    await this.prisma.$transaction([
      exists
        ? this.prisma.asset.updateMany({ where: { id: asset.id }, data })
        : this.prisma.asset.create({ data: { id: asset.id, ...data } }),
      this.prisma.assetDocument.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.assetDocument.createMany({ data: documents }),
      // Rights are replaced wholesale with the document set, in the same
      // transaction: a half-written matrix would misstate what holders own.
      this.prisma.assetRight.deleteMany({ where: { assetId: asset.id } }),
      this.prisma.assetRight.createMany({ data: rights }),
    ]);
  }
}

export class PrismaAssetEventLog implements AssetEventLog {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: AssetEvent): Promise<void> {
    await this.prisma.assetEvent.create({
      data: {
        assetId: event.assetId,
        event: event.event,
        actor: event.actor,
        ...(event.details ? { details: event.details } : {}),
      },
    });
  }
}

// FR-RA-2 read side of the same append-only table PrismaAssetEventLog writes.
// Newest first; same-timestamp rows tie-break on the autoincrement id, which
// is insertion order — matching the in-memory contract fixture exactly.
export class PrismaAssetEventReader implements AssetEventReader {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: {
    assetId?: string;
    actor?: string;
    limit?: number;
  }): Promise<RecordedAssetEvent[]> {
    const where = {
      ...(filter.assetId !== undefined ? { assetId: filter.assetId } : {}),
      ...(filter.actor !== undefined ? { actor: filter.actor } : {}),
    };
    const rows = await this.prisma.assetEvent.findMany({
      ...(Object.keys(where).length > 0 ? { where } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(filter.limit !== undefined ? { take: filter.limit } : {}),
    });
    return rows.map((row) => ({
      id: String(row.id),
      assetId: row.assetId,
      event: row.event,
      actor: row.actor,
      details: (row.details ?? {}) as Record<string, string>,
      at: row.createdAt,
    }));
  }
}

// A stored review, rebuilt. An unrecognised state is treated as PENDING rather
// than guessed at: the safe reading of a corrupt row is "nobody reviewed this",
// never "somebody did".
const toReview = (row: {
  reviewState: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
}): DocumentReview => {
  const state: DocumentReviewState =
    row.reviewState === "accepted"
      ? "accepted"
      : row.reviewState === "rejected"
        ? "rejected"
        : "pending";
  return {
    state,
    ...(row.reviewedBy === null ? {} : { reviewedBy: row.reviewedBy }),
    ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt }),
    ...(row.reviewReason === null ? {} : { reason: row.reviewReason }),
  };
};

const toDomain = (row: AssetRow & { documents: DocRow[]; rights: RightRow[] }): Asset =>
  Asset.restore({
    id: row.id,
    name: row.name,
    type: row.type as AssetType,
    state: row.state,
    dossier: LegalDossier.restore(
      row.documents.map((d) =>
        DossierDocument.of({
          kind: d.kind as DossierDocumentKind,
          title: d.title,
          cid: d.cid,
          sha256: d.sha256,
          investorVisible: d.investorVisible,
          review: toReview(d),
        }),
      ),
    ),
    checklist: OnboardingChecklist.restore(row.checklist as ChecklistItem[]),
    // A row with no address has had no profile recorded — restored as absent
    // rather than as a half-built object.
    ...(row.addressLine !== null &&
    row.city !== null &&
    row.propertyType !== null &&
    row.areaSquareMetres !== null &&
    row.titleReference !== null
      ? {
          realEstate: RealEstateProfile.of({
            addressLine: row.addressLine,
            city: row.city,
            propertyType: row.propertyType as PropertyType,
            areaSquareMetres: row.areaSquareMetres,
            titleReference: row.titleReference,
            ...(row.builtInYear !== null ? { builtInYear: row.builtInYear } : {}),
          }),
        }
      : {}),
    rights: RightsMatrix.restore(
      row.rights.map((right) => ({ kind: right.kind as RightKind, note: right.note })),
    ),
    // Absent stays absent: a platform-onboarded asset has no organisation.
    ...(row.organisationId !== null ? { organisationId: row.organisationId } : {}),
    custody:
      row.custodianName !== null && row.custodyLocation !== null
        ? CustodyArrangement.of({
            custodianName: row.custodianName,
            location: row.custodyLocation,
          })
        : undefined,
    ...(row.tokenAddress !== null ? { tokenAddress: row.tokenAddress } : {}),
  });
