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
  ) {}

  withInvestorVisibility(visible: boolean): DossierDocument {
    return new DossierDocument(this.kind, this.title, this.cid, this.sha256, visible);
  }

  static of(fields: {
    kind: DossierDocumentKind;
    title: string;
    cid: string;
    sha256: string;
    investorVisible?: boolean;
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
    );
  }
}

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
