import type { AssetRepository } from "./ports.js";
import type {
  DocumentReviewState,
  DossierDocumentKind,
} from "../../domain/assets/legal-dossier.js";

export interface DocumentAwaitingReviewView {
  assetId: string;
  assetName: string;
  kind: DossierDocumentKind;
  title: string;
  cid: string;
  sha256: string;
  state: DocumentReviewState;
  // Present when a previous review rejected it: the queue shows what the
  // issuer was told, so the next reviewer is not starting from nothing.
  reason?: string;
}

// 4.3: `/ops/documents` — every dossier document still waiting on a person.
//
// A REJECTED document stays in the queue. It is outstanding work, not a settled
// question: something has to replace it before the asset can be approved.
//
// Assets whose dossier is frozen are left out. They were approved, which now
// requires every document accepted, and their dossier can no longer change —
// listing them would be busywork that never clears.
export class ListDocumentsAwaitingReview {
  constructor(private readonly assets: AssetRepository) {}

  async execute(): Promise<DocumentAwaitingReviewView[]> {
    const assets = await this.assets.findAll();
    const queue: DocumentAwaitingReviewView[] = [];
    for (const asset of assets) {
      if (!asset.isDossierEditable()) {
        continue;
      }
      for (const document of asset.dossier.awaitingReview()) {
        queue.push({
          assetId: asset.id,
          assetName: asset.name,
          kind: document.kind,
          title: document.title,
          cid: document.cid,
          sha256: document.sha256,
          state: document.review.state,
          ...(document.review.reason === undefined ? {} : { reason: document.review.reason }),
        });
      }
    }
    return queue;
  }
}
