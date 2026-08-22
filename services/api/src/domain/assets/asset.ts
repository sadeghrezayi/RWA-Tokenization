import type { CustodyArrangement } from "./custody-arrangement.js";
import type { DossierDocument, DossierDocumentKind } from "./legal-dossier.js";
import type { RealEstateProfile } from "./real-estate-profile.js";
import { RightsMatrix } from "./rights-matrix.js";
import { LegalDossier } from "./legal-dossier.js";
import type { ChecklistItem } from "./onboarding-checklist.js";
import { OnboardingChecklist } from "./onboarding-checklist.js";
import {
  ChecklistIncompleteError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidAssetTransitionError,
  InvalidTokenAddressError,
} from "./errors.js";

// FR-AO-5 lifecycle. PRD T3: only the asset-backed subtype exists in v1.
export type AssetState =
  "proposed" | "in_structuring" | "approved" | "tokenized" | "suspended" | "retired";

export type AssetType = "asset_backed";

// States in which the dossier (documents, custody) may still be edited.
const STRUCTURING_STATES: readonly AssetState[] = ["proposed", "in_structuring"];

export class Asset {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: AssetType,
    public readonly state: AssetState,
    public readonly dossier: LegalDossier,
    public readonly checklist: OnboardingChecklist,
    public readonly custody: CustodyArrangement | undefined,
    public readonly tokenAddress: string | undefined,
    // 3.1: the property this token is issued against, and what it conveys.
    // Both are undefined/empty until a human records them — neither is inferred.
    public readonly realEstate: RealEstateProfile | undefined,
    public readonly rights: RightsMatrix,
    // 3.3: the issuer organisation that brought this asset. UNDEFINED IS A REAL
    // ANSWER — the platform onboards assets itself, and every pilot asset was
    // staff-onboarded. Settled at proposal and never reassigned: moving an asset
    // between issuers would rewrite who is answerable for it.
    public readonly organisationId: string | undefined,
  ) {}

  static propose(id: string, name: string, type: AssetType, organisationId?: string): Asset {
    return new Asset(
      id,
      name,
      type,
      "proposed",
      LegalDossier.empty(),
      OnboardingChecklist.empty(),
      undefined,
      undefined,
      undefined,
      RightsMatrix.empty(),
      organisationId,
    );
  }

  static restore(fields: {
    id: string;
    name: string;
    type: AssetType;
    state: AssetState;
    dossier: LegalDossier;
    checklist: OnboardingChecklist;
    custody: CustodyArrangement | undefined;
    tokenAddress?: string;
    realEstate?: RealEstateProfile;
    rights?: RightsMatrix;
    organisationId?: string;
  }): Asset {
    return new Asset(
      fields.id,
      fields.name,
      fields.type,
      fields.state,
      fields.dossier,
      fields.checklist,
      fields.custody,
      fields.tokenAddress,
      fields.realEstate,
      // An asset stored before rights were modelled restores as "not
      // established", which is the honest reading: nobody recorded them.
      fields.rights ?? RightsMatrix.empty(),
      fields.organisationId,
    );
  }

  startStructuring(): Asset {
    this.assertState("start structuring on", ["proposed"]);
    return this.with({ state: "in_structuring" });
  }

  attachDocument(document: DossierDocument): Asset {
    this.assertDossierEditable("attach a document to");
    return this.with({ dossier: this.dossier.add(document) });
  }

  // 4.3: a person read this document and said so. Behind assertDossierEditable,
  // unlike disclosure: approval already required every document accepted, so
  // re-opening one afterwards would change what an approved asset rests on.
  acceptDocument(kind: DossierDocumentKind, by: { reviewer: string; at: Date }): Asset {
    this.assertDossierEditable("review a document on");
    return this.with({
      dossier: this.dossier.reviewDocument(kind, (document) => document.accept(by)),
    });
  }

  rejectDocument(
    kind: DossierDocumentKind,
    by: { reviewer: string; at: Date; reason: string },
  ): Asset {
    this.assertDossierEditable("review a document on");
    return this.with({
      dossier: this.dossier.reviewDocument(kind, (document) => document.reject(by)),
    });
  }

  // Deliberately NOT behind assertDossierEditable: the documents themselves are
  // frozen at approval, but who may read them is a disclosure decision that has
  // to stay open — holders only exist once the asset is tokenized.
  setDocumentVisibility(kind: DossierDocumentKind, visible: boolean): Asset {
    return this.with({
      dossier: visible
        ? this.dossier.revealToInvestors(kind)
        : this.dossier.hideFromInvestors(kind),
    });
  }

  // Both freeze with the dossier at approval: what a holder owns must not
  // change quietly after they own it.
  recordRealEstateProfile(realEstate: RealEstateProfile): Asset {
    this.assertDossierEditable("record a property profile on");
    return this.with({ realEstate });
  }

  conveyRight(kind: string, note: string): Asset {
    this.assertDossierEditable("convey a right on");
    return this.with({ rights: this.rights.convey(kind, note) });
  }

  withholdRight(kind: string): Asset {
    this.assertDossierEditable("withhold a right on");
    return this.with({ rights: this.rights.withhold(kind) });
  }

  recordCustody(custody: CustodyArrangement): Asset {
    this.assertDossierEditable("record custody on");
    return this.with({ custody });
  }

  confirmChecklistItem(item: ChecklistItem): Asset {
    this.assertState("confirm a checklist item on", ["in_structuring"]);
    return this.with({ checklist: this.checklist.confirm(item) });
  }

  // FR-AO-4 operator gate: a complete dossier, recorded custody, and a fully
  // confirmed checklist are all preconditions of approval.
  approve(): Asset {
    this.assertState("approve", ["in_structuring"]);
    const missing: string[] = this.dossier.missingKinds();
    if (this.custody === undefined) {
      missing.push("custody_arrangement");
    }
    if (missing.length > 0) {
      throw new IncompleteDossierError(
        `cannot approve: the legal dossier is missing ${missing.join(", ")}`,
      );
    }
    // 4.3: present is not the same as read. Without this, an issuer could
    // attach a document AFTER staff confirmed the checklist and the officer who
    // confirmed "legal right clear" would never have seen the file backing it.
    // A rejected document counts as unreviewed — it awaits a sound replacement.
    const unreviewed = this.dossier.awaitingReview().map((document) => document.kind);
    if (unreviewed.length > 0) {
      throw new IncompleteDossierError(
        `cannot approve: these dossier documents have not been reviewed and accepted: ${unreviewed.join(", ")}`,
      );
    }
    if (!this.checklist.allConfirmed()) {
      throw new ChecklistIncompleteError(
        `cannot approve: unconfirmed checklist items ${this.checklist.unconfirmedItems().join(", ")}`,
      );
    }
    return this.with({ state: "approved" });
  }

  markTokenized(tokenAddress: string): Asset {
    this.assertState("mark tokenized", ["approved"]);
    if (tokenAddress.trim() === "") {
      throw new InvalidTokenAddressError("a tokenized asset needs a non-empty token address");
    }
    return this.with({ state: "tokenized", tokenAddress });
  }

  suspend(): Asset {
    this.assertState("suspend", ["tokenized"]);
    return this.with({ state: "suspended" });
  }

  resume(): Asset {
    this.assertState("resume", ["suspended"]);
    return this.with({ state: "tokenized" });
  }

  retire(): Asset {
    this.assertState("retire", ["tokenized", "suspended"]);
    return this.with({ state: "retired" });
  }

  // Public because the document-review queue asks the same question the guard
  // asks: a frozen dossier has nothing left to review.
  isDossierEditable(): boolean {
    return STRUCTURING_STATES.includes(this.state);
  }

  private assertDossierEditable(action: string): void {
    if (!this.isDossierEditable()) {
      throw new DossierFrozenError(
        `cannot ${action} an asset in state "${this.state}" — the dossier is frozen after approval`,
      );
    }
  }

  private assertState(action: string, allowed: readonly AssetState[]): void {
    if (!allowed.includes(this.state)) {
      throw new InvalidAssetTransitionError(`cannot ${action} an asset in state "${this.state}"`);
    }
  }

  private with(changes: {
    state?: AssetState;
    dossier?: LegalDossier;
    checklist?: OnboardingChecklist;
    custody?: CustodyArrangement;
    tokenAddress?: string;
    realEstate?: RealEstateProfile;
    rights?: RightsMatrix;
  }): Asset {
    return new Asset(
      this.id,
      this.name,
      this.type,
      changes.state ?? this.state,
      changes.dossier ?? this.dossier,
      changes.checklist ?? this.checklist,
      changes.custody ?? this.custody,
      changes.tokenAddress ?? this.tokenAddress,
      changes.realEstate ?? this.realEstate,
      changes.rights ?? this.rights,
      // Deliberately not a `change`: who is answerable for an asset is settled
      // at proposal and carried unaltered through every transition.
      this.organisationId,
    );
  }
}
