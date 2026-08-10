import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

// Which dossier documents a holder may read is a DECISION, not a property of
// the document — so it is made explicitly, one document at a time, and written
// to the asset's event log with the name of whoever made it. Revealing and
// withdrawing are recorded alike.
export class SetDocumentVisibility {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    kind: DossierDocumentKind;
    visible: boolean;
    actor: string;
  }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    await this.assets.save(asset.setDocumentVisibility(input.kind, input.visible));
    await this.events.append({
      assetId: input.assetId,
      event: "document_visibility_changed",
      actor: input.actor,
      details: { kind: input.kind, investorVisible: String(input.visible) },
    });
  }
}
