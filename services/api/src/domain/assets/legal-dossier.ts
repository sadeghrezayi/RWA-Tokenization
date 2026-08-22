import { DocumentNotInDossierError, InvalidDossierDocumentError } from "./errors.js";

// FR-AO-1 + FR-AO-3: the six document kinds a legal dossier must contain
// before an asset can be approved for token configuration.
export const REQUIRED_DOSSIER_KINDS = [
  "ownership_evidence",
  "spv_structure",
  "right_definition",
  "valuation_report",
  "counsel_signoff",
  "custody_agreement",
] as const;

export type DossierDocumentKind = (typeof REQUIRED_DOSSIER_KINDS)[number];

const SHA256_HEX = /^[0-9a-f]{64}$/;

// 4.3: whether a person has actually read this document.
//
// Deliberately separate from whether the document EXISTS. A dossier is complete
// because the six kinds are present; it is reviewed because someone read each
// one and said so. Conflating the two is how an asset gets approved on files
// nobody opened — which is the platform's central claim inverted.
export type DocumentReviewState = "pending" | "accepted" | "rejected";

export interface DocumentReview {
  state: DocumentReviewState;
  reviewedBy?: string;
  reviewedAt?: Date;
  // Required to reject: a refusal the issuer cannot act on is a wall.
  reason?: string;
}

const PENDING: DocumentReview = { state: "pending" };

export class DossierDocument {
  private constructor(
    public readonly kind: DossierDocumentKind,
    public readonly title: string,
    public readonly cid: string,
    public readonly sha256: string,
    // Hidden from holders unless an operator deliberately reveals it. The
    // dossier is assembled for the operator and the regulator; what an investor
    // is GIVEN is a separate, deliberate decision.
    public readonly investorVisible = false,
    public readonly review: DocumentReview = PENDING,
  ) {}

  withInvestorVisibility(visible: boolean): DossierDocument {
    // Revealing a document to holders says nothing about whether it is sound,
    // so the review rides along untouched.
    return new DossierDocument(this.kind, this.title, this.cid, this.sha256, visible, this.review);
  }

  accept(by: { reviewer: string; at: Date }): DossierDocument {
    return this.reviewed({
      state: "accepted",
      reviewedBy: requireReviewer(by.reviewer),
      reviewedAt: by.at,
    });
  }

  reject(by: { reviewer: string; at: Date; reason: string }): DossierDocument {
    const reason = by.reason.trim();
    if (reason === "") {
      throw new InvalidDossierDocumentError(
        "a rejected document needs a reason: the issuer has to know what to fix",
      );
    }
    return this.reviewed({
      state: "rejected",
      reviewedBy: requireReviewer(by.reviewer),
      reviewedAt: by.at,
      reason,
    });
  }

  // A replacement is a NEW question. Carrying the old acceptance forward would
  // launder bytes nobody reviewed through a decision made about different ones.
  replacedWith(fields: { title: string; cid: string; sha256: string }): DossierDocument {
    return DossierDocument.of({
      kind: this.kind,
      title: fields.title,
      cid: fields.cid,
      sha256: fields.sha256,
      investorVisible: this.investorVisible,
    });
  }

  private reviewed(review: DocumentReview): DossierDocument {
    return new DossierDocument(
      this.kind,
      this.title,
      this.cid,
      this.sha256,
      this.investorVisible,
      review,
    );
  }

  static of(fields: {
    kind: DossierDocumentKind;
    title: string;
    cid: string;
    sha256: string;
    investorVisible?: boolean;
    review?: DocumentReview;
  }): DossierDocument {
    if (fields.title.trim() === "") {
      throw new InvalidDossierDocumentError("a dossier document needs a non-empty title");
    }
    if (fields.cid.trim() === "") {
      throw new InvalidDossierDocumentError("a dossier document needs a non-empty content id");
    }
    if (!SHA256_HEX.test(fields.sha256)) {
      throw new InvalidDossierDocumentError(
        "a dossier document needs a lowercase hex sha256 digest",
      );
    }
    return new DossierDocument(
      fields.kind,
      fields.title,
      fields.cid,
      fields.sha256,
      fields.investorVisible ?? false,
      // A document that has just arrived is unreviewed, always. Nothing an
      // uploader sends can make it look already-read.
      fields.review ?? PENDING,
    );
  }
}

const requireReviewer = (reviewer: string): string => {
  const named = reviewer.trim();
  if (named === "") {
    throw new InvalidDossierDocumentError("a document review must name the reviewer");
  }
  return named;
};

export class LegalDossier {
  private constructor(public readonly documents: readonly DossierDocument[]) {}

  static empty(): LegalDossier {
    return new LegalDossier([]);
  }

  static restore(documents: readonly DossierDocument[]): LegalDossier {
    return new LegalDossier([...documents]);
  }

  add(document: DossierDocument): LegalDossier {
    return new LegalDossier([...this.documents, document]);
  }

  isComplete(): boolean {
    return this.missingKinds().length === 0;
  }

  missingKinds(): DossierDocumentKind[] {
    const present = new Set(this.documents.map((d) => d.kind));
    return REQUIRED_DOSSIER_KINDS.filter((kind) => !present.has(kind));
  }

  // Every required document accepted. A REJECTED document is emphatically not
  // "dealt with": it still awaits a sound replacement.
  isFullyReviewed(): boolean {
    return this.isComplete() && this.awaitingReview().length === 0;
  }

  awaitingReview(): readonly DossierDocument[] {
    return this.documents.filter((document) => document.review.state !== "accepted");
  }

  reviewDocument(
    kind: DossierDocumentKind,
    decide: (document: DossierDocument) => DossierDocument,
  ): LegalDossier {
    if (!this.documents.some((document) => document.kind === kind)) {
      throw new DocumentNotInDossierError(kind);
    }
    return new LegalDossier(
      this.documents.map((document) => (document.kind === kind ? decide(document) : document)),
    );
  }

  // Disclosure is per document kind and reversible in both directions. It has
  // no bearing on completeness: a dossier is complete because the documents
  // exist, not because anyone can read them.
  revealToInvestors(kind: DossierDocumentKind): LegalDossier {
    return this.setVisibility(kind, true);
  }

  hideFromInvestors(kind: DossierDocumentKind): LegalDossier {
    return this.setVisibility(kind, false);
  }

  investorVisibleDocuments(): readonly DossierDocument[] {
    return this.documents.filter((document) => document.investorVisible);
  }

  private setVisibility(kind: DossierDocumentKind, visible: boolean): LegalDossier {
    if (!this.documents.some((document) => document.kind === kind)) {
      // Doing nothing quietly would let an operator believe they had published
      // something they had not.
      throw new DocumentNotInDossierError(kind);
    }
    return new LegalDossier(
      this.documents.map((document) =>
        document.kind === kind ? document.withInvestorVisibility(visible) : document,
      ),
    );
  }
}
