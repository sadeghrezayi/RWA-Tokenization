import type { Asset as AssetRow, AssetDocument as DocRow, PrismaClient } from "@prisma/client";
import { Asset } from "../../domain/assets/asset.js";
import type { AssetType } from "../../domain/assets/asset.js";
import { CustodyArrangement } from "../../domain/assets/custody-arrangement.js";
import { DossierDocument, LegalDossier } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../domain/assets/onboarding-checklist.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import type { AssetEvent, AssetEventLog, AssetRepository } from "../../application/assets/ports.js";
import type { AssetEventReader, RecordedAssetEvent } from "../../application/reporting/ports.js";

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Asset | undefined> {
    const row = await this.prisma.asset.findFirst({
      where: { id },
      include: { documents: true },
    });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({
      include: { documents: true },
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
    };
    const documents = asset.dossier.documents.map((d) => ({
      assetId: asset.id,
      kind: d.kind,
      title: d.title,
      cid: d.cid,
      sha256: d.sha256,
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

const toDomain = (row: AssetRow & { documents: DocRow[] }): Asset =>
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
        }),
      ),
    ),
    checklist: OnboardingChecklist.restore(row.checklist as ChecklistItem[]),
    custody:
      row.custodianName !== null && row.custodyLocation !== null
        ? CustodyArrangement.of({
            custodianName: row.custodianName,
            location: row.custodyLocation,
          })
        : undefined,
    ...(row.tokenAddress !== null ? { tokenAddress: row.tokenAddress } : {}),
  });
