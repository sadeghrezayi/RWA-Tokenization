import { DossierDocument } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";
import { EmptyDocumentError } from "./errors.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository, DocumentStore } from "./ports.js";

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
