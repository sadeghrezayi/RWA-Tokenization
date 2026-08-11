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
  tokenAddress?: string;
  custody?: { custodianName: string; location: string };
  checklist: { confirmed: ChecklistItem[]; unconfirmed: ChecklistItem[] };
  realEstate?: {
    addressLine: string;
    city: string;
    propertyType: string;
    areaSquareMetres: number;
    titleReference: string;
    builtInYear?: number;
  };
  rights: { kind: string; note: string }[];
  dossier: {
    complete: boolean;
    missingKinds: DossierDocumentKind[];
    documents: {
      kind: DossierDocumentKind;
      title: string;
      cid: string;
      sha256: string;
      investorVisible: boolean;
    }[];
  };
}

export const toAssetView = (asset: Asset): AssetView => ({
  id: asset.id,
  name: asset.name,
  type: asset.type,
  state: asset.state,
  ...(asset.tokenAddress !== undefined ? { tokenAddress: asset.tokenAddress } : {}),
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
  ...(asset.realEstate !== undefined
    ? {
        realEstate: {
          addressLine: asset.realEstate.addressLine,
          city: asset.realEstate.city,
          propertyType: asset.realEstate.propertyType,
          areaSquareMetres: asset.realEstate.areaSquareMetres,
          titleReference: asset.realEstate.titleReference,
          ...(asset.realEstate.builtInYear !== undefined
            ? { builtInYear: asset.realEstate.builtInYear }
            : {}),
        },
      }
    : {}),
  rights: asset.rights.conveyed().map((right) => ({ kind: right.kind, note: right.note })),
  dossier: {
    complete: asset.dossier.isComplete(),
    missingKinds: asset.dossier.missingKinds(),
    documents: asset.dossier.documents.map((d) => ({
      kind: d.kind,
      title: d.title,
      cid: d.cid,
      sha256: d.sha256,
      investorVisible: d.investorVisible,
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
