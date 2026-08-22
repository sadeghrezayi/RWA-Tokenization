import { describe, expect, it } from "vitest";
import { DossierDocument, LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import {
  DocumentNotInDossierError,
  DossierFrozenError,
  IncompleteDossierError,
  InvalidDossierDocumentError,
} from "../../../src/domain/assets/errors.js";
import { CustodyArrangement } from "../../../src/domain/assets/custody-arrangement.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import {
  CHECKLIST_ITEMS,
  OnboardingChecklist,
} from "../../../src/domain/assets/onboarding-checklist.js";

const REVIEWED_AT = new Date("2026-08-22T10:00:00.000Z");

const doc = (kind: Parameters<typeof DossierDocument.of>[0]["kind"] = "ownership_evidence") =>
  DossierDocument.of({
    kind,
    title: "Title deed",
    cid: "bafy-1",
    sha256: "a".repeat(64),
  });

describe("a dossier document's review", () => {
  it("starts UNREVIEWED — nobody has looked at a file just because it arrived", () => {
    expect(doc().review.state).toBe("pending");
    expect(doc().review.reviewedBy).toBeUndefined();
  });

  it("records who accepted it and when, because an anonymous acceptance cannot be questioned", () => {
    const accepted = doc().accept({ reviewer: "officer-1", at: REVIEWED_AT });

    expect(accepted.review.state).toBe("accepted");
    expect(accepted.review.reviewedBy).toBe("officer-1");
    expect(accepted.review.reviewedAt).toEqual(REVIEWED_AT);
  });

  it("REQUIRES a reason to reject, since a rejection nobody can act on is a wall", () => {
    expect(() => doc().reject({ reviewer: "officer-1", at: REVIEWED_AT, reason: "  " })).toThrow(
      InvalidDossierDocumentError,
    );

    const rejected = doc().reject({
      reviewer: "officer-1",
      at: REVIEWED_AT,
      reason: "the deed names a different parcel",
    });
    expect(rejected.review.state).toBe("rejected");
    expect(rejected.review.reason).toMatch(/different parcel/);
  });

  it("returns to pending when the document itself is replaced", () => {
    // The reviewer accepted THOSE bytes. A new file is a new question, and
    // carrying the old acceptance forward would launder it.
    const accepted = doc().accept({ reviewer: "officer-1", at: REVIEWED_AT });
    const replaced = accepted.replacedWith({
      title: "Title deed v2",
      cid: "bafy-2",
      sha256: "b".repeat(64),
    });

    expect(replaced.review.state).toBe("pending");
    expect(replaced.cid).toBe("bafy-2");
  });

  it("does not let a visibility change disturb the review", () => {
    // Revealing a document to holders says nothing about whether it is sound.
    const accepted = doc().accept({ reviewer: "officer-1", at: REVIEWED_AT });

    expect(accepted.withInvestorVisibility(true).review.state).toBe("accepted");
  });
});

describe("LegalDossier and review", () => {
  const full = () =>
    LegalDossier.restore([
      doc("ownership_evidence"),
      doc("spv_structure"),
      doc("right_definition"),
      doc("valuation_report"),
      doc("counsel_signoff"),
      doc("custody_agreement"),
    ]);

  it("is COMPLETE on documents existing, but not REVIEWED until each was accepted", () => {
    // Two different questions, deliberately kept apart: completeness is about
    // the file being there, review is about someone having read it.
    expect(full().isComplete()).toBe(true);
    expect(full().isFullyReviewed()).toBe(false);
    expect(
      full()
        .awaitingReview()
        .map((d) => d.kind),
    ).toHaveLength(6);
  });

  it("counts a REJECTED document as still awaiting review, not as dealt with", () => {
    const dossier = full().reviewDocument("spv_structure", (document) =>
      document.reject({ reviewer: "officer-1", at: REVIEWED_AT, reason: "wrong entity" }),
    );

    expect(dossier.isFullyReviewed()).toBe(false);
    expect(dossier.awaitingReview().map((d) => d.kind)).toContain("spv_structure");
  });

  it("is fully reviewed once every required document is accepted", () => {
    let dossier = full();
    for (const kind of [
      "ownership_evidence",
      "spv_structure",
      "right_definition",
      "valuation_report",
      "counsel_signoff",
      "custody_agreement",
    ] as const) {
      dossier = dossier.reviewDocument(kind, (document) =>
        document.accept({ reviewer: "officer-1", at: REVIEWED_AT }),
      );
    }

    expect(dossier.isFullyReviewed()).toBe(true);
    expect(dossier.awaitingReview()).toEqual([]);
  });
});

describe("approval and document review", () => {
  // The gate this closes: an issuer can attach a document AFTER staff confirmed
  // the checklist. The confirmation stands, approval proceeds, and the officer
  // who confirmed "legal right clear" never saw the file that now backs it.
  const reviewedDossier = (): LegalDossier => {
    let dossier = LegalDossier.restore([
      doc("ownership_evidence"),
      doc("spv_structure"),
      doc("right_definition"),
      doc("valuation_report"),
      doc("counsel_signoff"),
      doc("custody_agreement"),
    ]);
    for (const kind of [
      "ownership_evidence",
      "spv_structure",
      "right_definition",
      "valuation_report",
      "counsel_signoff",
      "custody_agreement",
    ] as const) {
      dossier = dossier.reviewDocument(kind, (document) =>
        document.accept({ reviewer: "officer-1", at: REVIEWED_AT }),
      );
    }
    return dossier;
  };

  const readyAsset = (dossier: LegalDossier) => {
    const asset = Asset.restore({
      id: "asset-1",
      name: "Vanak Tower",
      type: "asset_backed",
      state: "in_structuring",
      dossier,
      checklist: OnboardingChecklist.restore([...CHECKLIST_ITEMS]),
      custody: CustodyArrangement.of({ custodianName: "Bank Melli", location: "Vault 12, Tehran" }),
    });
    return asset;
  };

  it("REFUSES approval while a required document is unreviewed", () => {
    const unreviewed = LegalDossier.restore([
      doc("ownership_evidence"),
      doc("spv_structure"),
      doc("right_definition"),
      doc("valuation_report"),
      doc("counsel_signoff"),
      doc("custody_agreement"),
    ]);

    expect(() => readyAsset(unreviewed).approve()).toThrow(IncompleteDossierError);
    // And it names what is unreviewed, so the officer knows where to go.
    expect(() => readyAsset(unreviewed).approve()).toThrow(/unreviewed|not been reviewed/i);
  });

  it("REFUSES approval while a required document stands rejected", () => {
    const rejected = reviewedDossier().reviewDocument("counsel_signoff", (document) =>
      document.reject({ reviewer: "officer-1", at: REVIEWED_AT, reason: "unsigned" }),
    );

    expect(() => readyAsset(rejected).approve()).toThrow(IncompleteDossierError);
  });

  it("approves once every required document has been accepted", () => {
    expect(readyAsset(reviewedDossier()).approve().state).toBe("approved");
  });
});

describe("reviewing a document on the asset", () => {
  const structured = () => {
    let asset = Asset.propose("asset-1", "Vanak Tower", "asset_backed").startStructuring();
    asset = asset.attachDocument(doc("ownership_evidence"));
    return asset;
  };

  it("accepts and rejects a document by kind, naming the reviewer", () => {
    const accepted = structured().acceptDocument("ownership_evidence", {
      reviewer: "officer-1",
      at: REVIEWED_AT,
    });
    expect(accepted.dossier.documents[0]?.review.state).toBe("accepted");

    const rejected = structured().rejectDocument("ownership_evidence", {
      reviewer: "officer-1",
      at: REVIEWED_AT,
      reason: "the deed names a different parcel",
    });
    expect(rejected.dossier.documents[0]?.review.reason).toMatch(/different parcel/);
  });

  it("refuses to review a document the dossier does not hold", () => {
    expect(() =>
      structured().acceptDocument("counsel_signoff", { reviewer: "officer-1", at: REVIEWED_AT }),
    ).toThrow(DocumentNotInDossierError);
  });

  it("refuses to re-review a document once the dossier is frozen", () => {
    // Approval already required every document accepted; re-opening one
    // afterwards would change what an approved asset rests on.
    let asset = Asset.propose("asset-2", "Frozen", "asset_backed").startStructuring();
    for (const kind of [
      "ownership_evidence",
      "spv_structure",
      "right_definition",
      "valuation_report",
      "counsel_signoff",
      "custody_agreement",
    ] as const) {
      asset = asset
        .attachDocument(doc(kind))
        .acceptDocument(kind, { reviewer: "officer-1", at: REVIEWED_AT });
    }
    asset = asset.recordCustody(
      CustodyArrangement.of({ custodianName: "Trust Co.", location: "Vault 12" }),
    );
    asset = CHECKLIST_ITEMS.reduce((acc, item) => acc.confirmChecklistItem(item), asset).approve();

    expect(() =>
      asset.rejectDocument("counsel_signoff", {
        reviewer: "officer-2",
        at: REVIEWED_AT,
        reason: "second thoughts",
      }),
    ).toThrow(DossierFrozenError);
  });
});
