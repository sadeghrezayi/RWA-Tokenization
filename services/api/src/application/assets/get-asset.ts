import type { Asset, AssetState, AssetType } from "../../domain/assets/asset.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import { loadAsset } from "./load-asset.js";
import type { AssetRepository } from "./ports.js";

export interface AssetView {
  id: string;
  name: string;
  type: AssetType;
  state: AssetState;
  custody?: { custodianName: string; location: string };
  checklist: { confirmed: ChecklistItem[]; unconfirmed: ChecklistItem[] };
  dossier: {
    complete: boolean;
    missingKinds: DossierDocumentKind[];
    documents: { kind: DossierDocumentKind; title: string; cid: string; sha256: string }[];
  };
}

export const toAssetView = (asset: Asset): AssetView => ({
  id: asset.id,
  name: asset.name,
  type: asset.type,
  state: asset.state,
  ...(asset.custody
    ? {
        custody: {
          custodianName: asset.custody.custodianName,
          location: asset.custody.location,
        },
      }
    : {}),
  checklist: {
    confirmed: asset.checklist.confirmedItems(),
    unconfirmed: asset.checklist.unconfirmedItems(),
  },
  dossier: {
    complete: asset.dossier.isComplete(),
    missingKinds: asset.dossier.missingKinds(),
    documents: asset.dossier.documents.map((d) => ({
      kind: d.kind,
      title: d.title,
      cid: d.cid,
      sha256: d.sha256,
    })),
  },
});

export class GetAsset {
  constructor(private readonly assets: AssetRepository) {}

  async execute(input: { assetId: string }): Promise<AssetView> {
    return toAssetView(await loadAsset(this.assets, input.assetId));
  }
}

export class ListAssets {
  constructor(private readonly assets: AssetRepository) {}

  async execute(): Promise<AssetView[]> {
    return (await this.assets.findAll()).map(toAssetView);
  }
}
