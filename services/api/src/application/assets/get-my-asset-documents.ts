import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { NoPositionInAssetError } from "./errors.js";
import { loadAsset } from "./load-asset.js";
import type { AssetRepository } from "./ports.js";

export interface InvestorDocumentView {
  kind: DossierDocumentKind;
  title: string;
  cid: string;
  sha256: string;
}

// The assets an investor has a stake in. Kept as a port so this read model does
// not care whether a position means tokens held today or an allocation from a
// closed offering.
export interface InvestorPositions {
  execute(input: { investorId: string }): Promise<{ assetIds: string[] }>;
}

// 2.5d: the holder's side of the disclosure decision. Two rules, both load-
// bearing: you must have a position in the asset, and you see only what an
// operator deliberately revealed. A hidden document is not listed at all — its
// existence is not disclosed either.
export class GetMyAssetDocuments {
  constructor(
    private readonly assets: AssetRepository,
    private readonly positions: InvestorPositions,
  ) {}

  async execute(input: { investorId: string; assetId: string }): Promise<InvestorDocumentView[]> {
    const { assetIds } = await this.positions.execute({ investorId: input.investorId });
    if (!assetIds.includes(input.assetId)) {
      throw new NoPositionInAssetError(input.assetId);
    }
    const asset = await loadAsset(this.assets, input.assetId);
    return asset.dossier.investorVisibleDocuments().map((document) => ({
      kind: document.kind,
      title: document.title,
      cid: document.cid,
      sha256: document.sha256,
    }));
  }
}
