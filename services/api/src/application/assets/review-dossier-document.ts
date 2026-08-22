import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";
import type { Clock } from "../offerings/ports.js";

// 4.3: a person read this document and said what they concluded.
//
// This is the step the platform was missing. A document used to count toward a
// complete dossier the moment it was attached — including one an ISSUER
// attached — so an asset could be approved on files nobody had opened. Approval
// now requires every required document accepted, and this is how that happens.
//
// Accepting and rejecting are the same act with different outcomes, so both are
// written to the asset's event log with the reviewer's name; a rejection also
// carries its reason, which is what the issuer needs in order to fix anything.
export class ReviewDossierDocument {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  accept(input: { assetId: string; kind: DossierDocumentKind; actor: string }): Promise<void> {
    return this.decide(input, (asset) =>
      asset.acceptDocument(input.kind, { reviewer: input.actor, at: this.clock.now() }),
    );
  }

  reject(input: {
    assetId: string;
    kind: DossierDocumentKind;
    actor: string;
    reason: string;
  }): Promise<void> {
    return this.decide(
      input,
      (asset) =>
        asset.rejectDocument(input.kind, {
          reviewer: input.actor,
          at: this.clock.now(),
          reason: input.reason,
        }),
      input.reason,
    );
  }

  private async decide(
    input: { assetId: string; kind: DossierDocumentKind; actor: string },
    apply: (asset: Awaited<ReturnType<typeof loadAsset>>) => Awaited<ReturnType<typeof loadAsset>>,
    reason?: string,
  ): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    // The domain validates first — a rejection with no reason must leave no
    // trace at all, not a log line saying a decision was made.
    const decided = apply(asset);
    const document = decided.dossier.documents.find((row) => row.kind === input.kind);
    await this.assets.save(decided);
    await this.events.append({
      assetId: input.assetId,
      event: "document_reviewed",
      actor: input.actor,
      details: {
        kind: input.kind,
        decision: document?.review.state ?? "unknown",
        ...(reason === undefined ? {} : { reason }),
      },
    });
  }
}
