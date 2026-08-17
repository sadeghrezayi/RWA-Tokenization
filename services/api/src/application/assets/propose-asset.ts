import { Asset } from "../../domain/assets/asset.js";
import type { IdGenerator } from "../identity/ports.js";
import { loadIssuer } from "../issuers/load-issuer.js";
import type { IssuerRepository } from "../issuers/ports.js";
import { IssuerCannotSubmitAssetsError } from "./errors.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

// 3.3: an asset is either brought by an issuer organisation or onboarded by the
// platform itself. Both are real; no organisation is not a missing value.
//
// When one IS named, this is where IssuerOrganisation.canSubmitAssets() finally
// decides something: an organisation that has not been approved, or has been
// suspended, cannot have assets submitted in its name — and the refusal happens
// before anything is written.
export class ProposeAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
    private readonly issuers: IssuerRepository,
  ) {}

  async execute(input: {
    name: string;
    actor: string;
    organisationId?: string;
  }): Promise<{ assetId: string }> {
    if (input.organisationId !== undefined) {
      const organisation = await loadIssuer(this.issuers, input.organisationId);
      if (!organisation.canSubmitAssets()) {
        throw new IssuerCannotSubmitAssetsError(organisation.legalName, organisation.state);
      }
    }
    const asset = Asset.propose(
      this.ids.nextId(),
      input.name,
      "asset_backed",
      input.organisationId,
    );
    await this.assets.save(asset);
    await this.events.append({ assetId: asset.id, event: "asset_proposed", actor: input.actor });
    return { assetId: asset.id };
  }
}
