import type { Asset as AssetRow, AssetDocument as DocRow, PrismaClient } from "@prisma/client";
import { Asset } from "../../domain/assets/asset.js";
import type { AssetType } from "../../domain/assets/asset.js";
import { CustodyArrangement } from "../../domain/assets/custody-arrangement.js";
import { DossierDocument, LegalDossier } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../domain/assets/onboarding-checklist.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import type { AssetEvent, AssetEventLog, AssetRepository } from "../../application/assets/ports.js";

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Asset | undefined> {
    const row = await this.prisma.asset.findUnique({
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
    await this.prisma.$transaction([
      this.prisma.asset.upsert({
        where: { id: asset.id },
        create: { id: asset.id, ...data },
        update: data,
      }),
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
  });
