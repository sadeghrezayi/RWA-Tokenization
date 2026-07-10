import { describe, expect, it } from "vitest";
import {
  DossierDocument,
  LegalDossier,
  REQUIRED_DOSSIER_KINDS,
} from "../../../src/domain/assets/legal-dossier.js";
import { InvalidDossierDocumentError } from "../../../src/domain/assets/errors.js";

const SHA = "a".repeat(64);

const doc = (kind: (typeof REQUIRED_DOSSIER_KINDS)[number], title = "Doc") =>
  DossierDocument.of({ kind, title, cid: `Qm${kind}`, sha256: SHA });

// FR-AO-1 + FR-AO-3: the dossier is complete only with every required document kind.
describe("LegalDossier", () => {
  it("starts_empty_and_incomplete_with_all_kinds_missing", () => {
    const dossier = LegalDossier.empty();
    expect(dossier.documents).toEqual([]);
    expect(dossier.isComplete()).toBe(false);
    expect(dossier.missingKinds()).toEqual([...REQUIRED_DOSSIER_KINDS]);
  });

  it("tracks_missing_kinds_as_documents_arrive", () => {
    const dossier = LegalDossier.empty().add(doc("ownership_evidence"));
    expect(dossier.missingKinds()).not.toContain("ownership_evidence");
    expect(dossier.isComplete()).toBe(false);
  });

  it("is_complete_with_at_least_one_document_of_every_required_kind", () => {
    const dossier = REQUIRED_DOSSIER_KINDS.reduce(
      (acc, kind) => acc.add(doc(kind)),
      LegalDossier.empty(),
    );
    expect(dossier.isComplete()).toBe(true);
    expect(dossier.missingKinds()).toEqual([]);
  });

  it("allows_multiple_documents_of_the_same_kind", () => {
    const dossier = LegalDossier.empty()
      .add(doc("valuation_report", "Valuation 2025"))
      .add(doc("valuation_report", "Valuation 2026"));
    expect(dossier.documents).toHaveLength(2);
  });

  it("is_immutable_add_returns_a_new_dossier", () => {
    const empty = LegalDossier.empty();
    empty.add(doc("ownership_evidence"));
    expect(empty.documents).toEqual([]);
  });

  it.each([
    { title: "", cid: "QmX", sha256: SHA },
    { title: "Deed", cid: "", sha256: SHA },
    { title: "Deed", cid: "QmX", sha256: "not-hex" },
    { title: "Deed", cid: "QmX", sha256: "abc123" },
  ])("rejects_an_invalid_document_%#", (fields) => {
    expect(() => DossierDocument.of({ kind: "ownership_evidence", ...fields })).toThrow(
      InvalidDossierDocumentError,
    );
  });
});
