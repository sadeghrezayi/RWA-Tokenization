import { AssetNotBroughtByOrganisationError } from "./errors.js";
import { loadAsset } from "./load-asset.js";
import type { AssetRepository } from "./ports.js";
import type { AttachDossierDocument } from "./attach-dossier-document.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";

// 3.3i: an issuer supplies the dossier for the asset it brought.
//
// Deliberately a thin gate in front of the SAME use case staff call: what a
// dossier document is, which kinds exist, that the contents freeze on approval
// — none of that changes because the person filing it works for the issuer
// rather than the platform. The only new question is whether this asset is
// theirs, and the caller's membership cannot answer it: membership says which
// organisation you act for, not which assets that organisation brought.
export class AttachIssuerDocument {
  constructor(
    private readonly assets: AssetRepository,
    private readonly attach: AttachDossierDocument,
  ) {}

  async execute(input: {
    organisationId: string;
    assetId: string;
    kind: DossierDocumentKind;
    title: string;
    contentBase64: string;
    actor: string;
  }): Promise<{ cid: string; sha256: string }> {
    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.organisationId !== input.organisationId) {
      throw new AssetNotBroughtByOrganisationError();
    }
    return this.attach.execute({
      assetId: input.assetId,
      kind: input.kind,
      title: input.title,
      contentBase64: input.contentBase64,
      actor: input.actor,
    });
  }
}
