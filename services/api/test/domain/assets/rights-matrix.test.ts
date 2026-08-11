import { describe, expect, it } from "vitest";
import {
  RIGHT_KINDS,
  RIGHTS_ARE_PROVISIONAL,
  RightsMatrix,
} from "../../../src/domain/assets/rights-matrix.js";
import { UnknownRightError } from "../../../src/domain/assets/errors.js";

// 3.1: what a token actually conveys to its holder. The platform's central
// claim is that a token is only as good as the off-chain enforceable right
// behind it, so this is the record of that right — per asset, entered by a
// human, never inferred.
describe("RightsMatrix", () => {
  it("conveys nothing until someone says otherwise", () => {
    // Silence must never read as a granted right. An empty matrix is an asset
    // whose rights have not been established yet.
    const matrix = RightsMatrix.empty();

    expect(matrix.conveyed()).toEqual([]);
    expect(matrix.conveys("income")).toBe(false);
    expect(matrix.isEstablished()).toBe(false);
  });

  it("records a conveyed right with the wording it was granted in", () => {
    // The note carries the actual clause. A boolean alone would claim more
    // precision than the underlying document supports.
    const matrix = RightsMatrix.empty().convey(
      "income",
      "Net rental income, quarterly, clause 7.2",
    );

    expect(matrix.conveys("income")).toBe(true);
    expect(matrix.noteFor("income")).toBe("Net rental income, quarterly, clause 7.2");
    expect(matrix.isEstablished()).toBe(true);
  });

  it("withdraws a right without disturbing the others", () => {
    const matrix = RightsMatrix.empty()
      .convey("income", "clause 7.2")
      .convey("disposal_proceeds", "clause 9")
      .withhold("income");

    expect(matrix.conveys("income")).toBe(false);
    expect(matrix.conveys("disposal_proceeds")).toBe(true);
  });

  it("refuses a right it does not know", () => {
    // The catalogue is deliberately narrow and provisional; inventing kinds at
    // the call site would make the matrix unreadable across assets.
    expect(() => RightsMatrix.empty().convey("timeshare_weeks", "made up")).toThrow(
      UnknownRightError,
    );
  });

  it("requires a note that says something", () => {
    // "Yes" with no wording is the failure mode this exists to prevent: a right
    // asserted with nothing behind it.
    expect(() => RightsMatrix.empty().convey("income", "   ")).toThrow();
  });

  it("restores exactly what was stored, and nothing more", () => {
    const matrix = RightsMatrix.restore([
      { kind: "voting", note: "one token one vote, clause 12" },
    ]);

    expect(matrix.conveyed().map((right) => right.kind)).toEqual(["voting"]);
    expect(matrix.conveys("income")).toBe(false);
  });

  it("declares itself provisional, because the catalogue is not legal advice", () => {
    // Same posture as the onboarding field set: the shape is ours, the taxonomy
    // needs local legal validation before anyone relies on it.
    expect(RIGHTS_ARE_PROVISIONAL).toBe(true);
    expect(RIGHT_KINDS.length).toBeGreaterThan(0);
  });
});
