import { describe, expect, it } from "vitest";
import { Asset } from "../../../src/domain/assets/asset.js";
import { CustodyArrangement } from "../../../src/domain/assets/custody-arrangement.js";
import {
  DossierDocument,
  REQUIRED_DOSSIER_KINDS,
} from "../../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../../src/domain/assets/onboarding-checklist.js";
import {
  ChecklistIncompleteError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidAssetTransitionError,
  InvalidCustodyArrangementError,
  InvalidTokenAddressError,
} from "../../../src/domain/assets/errors.js";

const SHA = "b".repeat(64);

const doc = (kind: (typeof REQUIRED_DOSSIER_KINDS)[number]) =>
  DossierDocument.of({ kind, title: `${kind} doc`, cid: `Qm${kind}`, sha256: SHA });

const propose = () => Asset.propose("asset-1", "Pilot Real Estate SPV", "asset_backed");

// Fully structured: all documents attached, custody recorded, checklist confirmed.
const readyForApproval = () => {
  let asset = propose().startStructuring();
  for (const kind of REQUIRED_DOSSIER_KINDS) {
    asset = asset.attachDocument(doc(kind));
  }
  asset = asset.recordCustody(
    CustodyArrangement.of({ custodianName: "Trust Co.", location: "Vault 12, Tehran" }),
  );
  return CHECKLIST_ITEMS.reduce((acc, item) => acc.confirmChecklistItem(item), asset);
};

describe("Asset lifecycle (FR-AO-5)", () => {
  it("is_proposed_on_creation", () => {
    const asset = propose();
    expect(asset.id).toBe("asset-1");
    expect(asset.name).toBe("Pilot Real Estate SPV");
    expect(asset.type).toBe("asset_backed");
    expect(asset.state).toBe("proposed");
  });

  it("walks_proposed_to_structuring_to_approved_to_tokenized", () => {
    const approved = readyForApproval().approve();
    expect(approved.state).toBe("approved");
    expect(approved.tokenAddress).toBeUndefined();
    const tokenized = approved.markTokenized("0xToken1");
    expect(tokenized.state).toBe("tokenized");
    expect(tokenized.tokenAddress).toBe("0xToken1");
  });

  it("rejects_marking_tokenized_with_a_blank_token_address", () => {
    expect(() => readyForApproval().approve().markTokenized("  ")).toThrow(
      InvalidTokenAddressError,
    );
  });

  it("keeps_the_token_address_through_later_transitions", () => {
    const suspended = readyForApproval().approve().markTokenized("0xToken1").suspend();
    expect(suspended.tokenAddress).toBe("0xToken1");
    expect(suspended.resume().tokenAddress).toBe("0xToken1");
  });

  it("suspends_resumes_and_retires_a_tokenized_asset", () => {
    const tokenized = readyForApproval().approve().markTokenized("0xToken1");
    const suspended = tokenized.suspend();
    expect(suspended.state).toBe("suspended");
    expect(suspended.resume().state).toBe("tokenized");
    expect(suspended.retire().state).toBe("retired");
    expect(tokenized.retire().state).toBe("retired");
  });

  it.each([
    ["approve_from_proposed", () => propose().approve()],
    ["tokenize_before_approval", () => propose().startStructuring().markTokenized("0xToken1")],
    ["suspend_before_tokenized", () => readyForApproval().approve().suspend()],
    ["start_structuring_twice", () => propose().startStructuring().startStructuring()],
    ["retire_from_proposed", () => propose().retire()],
  ])("rejects_invalid_transition_%s", (_name, act) => {
    expect(act).toThrow(InvalidAssetTransitionError);
  });
});

describe("Approval gate (FR-AO-1 + FR-AO-4)", () => {
  it("refuses_approval_while_dossier_documents_are_missing", () => {
    let asset = propose().startStructuring();
    asset = CHECKLIST_ITEMS.reduce((acc, item) => acc.confirmChecklistItem(item), asset);
    expect(() => asset.approve()).toThrow(IncompleteDossierError);
    expect(() => asset.approve()).toThrow(/ownership_evidence/);
  });

  it("refuses_approval_while_checklist_items_are_unconfirmed", () => {
    let asset = propose().startStructuring();
    for (const kind of REQUIRED_DOSSIER_KINDS) {
      asset = asset.attachDocument(doc(kind));
    }
    asset = asset.recordCustody(
      CustodyArrangement.of({ custodianName: "Trust Co.", location: "Vault 12" }),
    );
    expect(() => asset.approve()).toThrow(ChecklistIncompleteError);
    expect(() => asset.approve()).toThrow(/legal_right_clear/);
  });

  it("freezes_the_dossier_after_approval", () => {
    const approved = readyForApproval().approve();
    expect(() => approved.attachDocument(doc("valuation_report"))).toThrow(DossierFrozenError);
    expect(() =>
      approved.recordCustody(CustodyArrangement.of({ custodianName: "X", location: "Y" })),
    ).toThrow(DossierFrozenError);
  });

  it("confirms_checklist_items_only_during_structuring", () => {
    expect(() => propose().confirmChecklistItem("transferable")).toThrow(
      InvalidAssetTransitionError,
    );
  });

  it("attaches_documents_while_proposed_or_structuring", () => {
    const inProposed = propose().attachDocument(doc("ownership_evidence"));
    expect(inProposed.dossier.documents).toHaveLength(1);
  });
});

describe("CustodyArrangement (FR-AO-3)", () => {
  it("records_custodian_and_location", () => {
    const asset = readyForApproval();
    expect(asset.custody?.custodianName).toBe("Trust Co.");
    expect(asset.custody?.location).toBe("Vault 12, Tehran");
  });

  it.each([
    { custodianName: "", location: "Vault" },
    { custodianName: "Trust Co.", location: "  " },
  ])("rejects_blank_custody_fields_%#", (fields) => {
    expect(() => CustodyArrangement.of(fields)).toThrow(InvalidCustodyArrangementError);
  });

  it("requires_custody_to_be_recorded_before_approval", () => {
    let asset = propose().startStructuring();
    for (const kind of REQUIRED_DOSSIER_KINDS) {
      asset = asset.attachDocument(doc(kind));
    }
    asset = CHECKLIST_ITEMS.reduce((acc, item) => acc.confirmChecklistItem(item), asset);
    expect(() => asset.approve()).toThrow(IncompleteDossierError);
  });
});

describe("Persistence seam", () => {
  it("restores_an_asset_verbatim", () => {
    const structured = readyForApproval();
    const restored = Asset.restore({
      id: structured.id,
      name: structured.name,
      type: structured.type,
      state: "approved",
      dossier: structured.dossier,
      checklist: structured.checklist,
      custody: structured.custody,
    });
    expect(restored.state).toBe("approved");
    expect(restored.markTokenized("0xToken1").state).toBe("tokenized");
  });
});
