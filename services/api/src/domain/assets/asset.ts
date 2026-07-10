import type { CustodyArrangement } from "./custody-arrangement.js";
import type { DossierDocument } from "./legal-dossier.js";
import { LegalDossier } from "./legal-dossier.js";
import type { ChecklistItem } from "./onboarding-checklist.js";
import { OnboardingChecklist } from "./onboarding-checklist.js";
import {
  ChecklistIncompleteError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidAssetTransitionError,
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
  ) {}

  static propose(id: string, name: string, type: AssetType): Asset {
    return new Asset(
      id,
      name,
      type,
      "proposed",
      LegalDossier.empty(),
      OnboardingChecklist.empty(),
      undefined,
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
  }): Asset {
    return new Asset(
      fields.id,
      fields.name,
      fields.type,
      fields.state,
      fields.dossier,
      fields.checklist,
      fields.custody,
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
    if (!this.checklist.allConfirmed()) {
      throw new ChecklistIncompleteError(
        `cannot approve: unconfirmed checklist items ${this.checklist.unconfirmedItems().join(", ")}`,
      );
    }
    return this.with({ state: "approved" });
  }

  markTokenized(): Asset {
    this.assertState("mark tokenized", ["approved"]);
    return this.with({ state: "tokenized" });
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

  private assertDossierEditable(action: string): void {
    if (!STRUCTURING_STATES.includes(this.state)) {
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
  }): Asset {
    return new Asset(
      this.id,
      this.name,
      this.type,
      changes.state ?? this.state,
      changes.dossier ?? this.dossier,
      changes.checklist ?? this.checklist,
      changes.custody ?? this.custody,
    );
  }
}
