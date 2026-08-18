import type { Asset, AssetState, AssetType } from "../../domain/assets/asset.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import type { IssuerRepository } from "../issuers/ports.js";
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
  // 3.3: who brought this asset. Both absent means the platform onboarded it
  // itself — a real answer, not a blank. The NAME is what an officer checks
  // against a company registry; the id is for links.
  organisationId?: string;
  organisationName?: string;
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

// An organisation whose name cannot be resolved leaves the asset with its id
// and no name — which issuer brought it is never hidden.
const organisationNameOf = (
  asset: Asset,
  names: ReadonlyMap<string, string>,
): { organisationName?: string } => {
  const name = asset.organisationId === undefined ? undefined : names.get(asset.organisationId);
  return name === undefined ? {} : { organisationName: name };
};

export const toAssetView = (
  asset: Asset,
  organisationNames: ReadonlyMap<string, string> = new Map(),
): AssetView => ({
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
  ...(asset.organisationId !== undefined ? { organisationId: asset.organisationId } : {}),
  ...organisationNameOf(asset, organisationNames),
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

// One lookup per distinct organisation, not per asset: one issuer brings many.
// An organisation that cannot be resolved leaves the asset with its id and no
// name, rather than hiding which issuer brought it.
const organisationNamesFor = async (
  issuers: IssuerRepository,
  assets: readonly Asset[],
): Promise<ReadonlyMap<string, string>> => {
  const ids = new Set(
    assets.map((a) => a.organisationId).filter((id): id is string => id !== undefined),
  );
  const names = new Map<string, string>();
  for (const id of ids) {
    const organisation = await issuers.findById(id);
    if (organisation !== undefined) {
      names.set(id, organisation.legalName);
    }
  }
  return names;
};

export class GetAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly issuers: IssuerRepository,
  ) {}

  async execute(input: { assetId: string }): Promise<AssetView> {
    const asset = await loadAsset(this.assets, input.assetId);
    return toAssetView(asset, await organisationNamesFor(this.issuers, [asset]));
  }
}

// 3.3f: what an issuer may read — the assets of ONE organisation, never the
// platform's own and never another issuer's. The caller proves membership
// before asking; this use case's job is that the answer contains nothing else.
//
// Filtered here rather than in the repository: at pilot scale the whole set is
// small, and adding a port method plus two adapters plus a contract case buys
// nothing a real requirement has asked for yet.
export class ListIssuerAssets {
  constructor(
    private readonly assets: AssetRepository,
    private readonly issuers: IssuerRepository,
  ) {}

  async execute(input: { organisationId: string }): Promise<AssetView[]> {
    const all = await this.assets.findAll();
    const mine = all.filter((asset) => asset.organisationId === input.organisationId);
    const names = await organisationNamesFor(this.issuers, mine);
    return mine.map((asset) => toAssetView(asset, names));
  }
}

export class ListAssets {
  constructor(
    private readonly assets: AssetRepository,
    private readonly issuers: IssuerRepository,
  ) {}

  async execute(): Promise<AssetView[]> {
    const assets = await this.assets.findAll();
    const names = await organisationNamesFor(this.issuers, assets);
    return assets.map((asset) => toAssetView(asset, names));
  }
}
