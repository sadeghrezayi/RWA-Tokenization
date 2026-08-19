import { DossierDocument } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { DossierDocumentTooLargeError, EmptyDocumentError } from "./errors.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository, DocumentStore } from "./ports.js";

// K-33: the same ceiling as KYC evidence (MAX_EVIDENCE_BYTES). A dossier
// document is a deed, a valuation or a counsel letter — 10 MB is generous for
// all three, and an unbounded upload is a denial-of-service dressed as a file.
export const MAX_DOSSIER_BYTES = 10 * 1024 * 1024;

export class AttachDossierDocument {
  constructor(
    private readonly assets: AssetRepository,
    private readonly documents: DocumentStore,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    kind: DossierDocumentKind;
    title: string;
    contentBase64: string;
    actor: string;
  }): Promise<{ cid: string; sha256: string }> {
    const asset = await loadAsset(this.assets, input.assetId);
    const content = Buffer.from(input.contentBase64, "base64");
    if (content.length === 0) {
      throw new EmptyDocumentError();
    }
    if (content.length > MAX_DOSSIER_BYTES) {
      throw new DossierDocumentTooLargeError(MAX_DOSSIER_BYTES);
    }
    // Store first (immutable, idempotent), then bind the reference to the asset.
    const { cid, sha256 } = await this.documents.store(content);
    const document = DossierDocument.of({ kind: input.kind, title: input.title, cid, sha256 });
    await this.assets.save(asset.attachDocument(document));
    await this.events.append({
      assetId: input.assetId,
      event: "document_attached",
      actor: input.actor,
      details: { kind: input.kind, cid, sha256 },
    });
    return { cid, sha256 };
  }
}
