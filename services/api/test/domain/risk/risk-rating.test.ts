import { describe, expect, it } from "vitest";
import { RiskAssessment, bandFor } from "../../../src/domain/risk/risk-rating.js";
import { InvalidRiskAssessmentError } from "../../../src/domain/risk/errors.js";

const thresholds = { medium: 3, high: 6 };

describe("bandFor", () => {
  it("puts a score exactly on a threshold in the HIGHER band", () => {
    // Where a boundary falls is a real policy question, and the safe reading is
    // the cautious one: a case that reaches the high threshold is high risk, not
    // "just under it". Silently rounding the other way would quietly downgrade
    // every borderline file in the book.
    expect(bandFor(2, thresholds)).toBe("low");
    expect(bandFor(3, thresholds)).toBe("medium");
    expect(bandFor(5, thresholds)).toBe("medium");
    expect(bandFor(6, thresholds)).toBe("high");
  });

  it("refuses thresholds that do not describe an ordered scale", () => {
    expect(() => bandFor(1, { medium: 6, high: 3 })).toThrow(InvalidRiskAssessmentError);
    expect(() => bandFor(1, { medium: -1, high: 3 })).toThrow(InvalidRiskAssessmentError);
  });
});

describe("RiskAssessment", () => {
  const answered = [
    { factorId: "geography", answer: "domestic", points: 0 },
    { factorId: "source_of_funds", answer: "salary", points: 1 },
  ];

  it("sums the points it was given and carries who decided, and when", () => {
    const at = new Date("2026-08-22T10:00:00.000Z");
    const assessment = RiskAssessment.of({
      subjectId: "inv-1",
      answers: answered,
      thresholds,
      assessedBy: "officer-1",
      assessedAt: at,
    });

    expect(assessment.score).toBe(1);
    expect(assessment.band).toBe("low");
    expect(assessment.assessedBy).toBe("officer-1");
    expect(assessment.assessedAt).toEqual(at);
  });

  it("REFUSES an assessment with no factors answered, rather than scoring it zero", () => {
    // The trap this exists to prevent: an empty assessment sums to 0, and 0 is
    // "low". Nobody looked at this person, and the file would read as cleared.
    // Absence of an assessment is not a low risk — it is no assessment.
    expect(() =>
      RiskAssessment.of({
        subjectId: "inv-1",
        answers: [],
        thresholds,
        assessedBy: "officer-1",
        assessedAt: new Date(),
      }),
    ).toThrow(InvalidRiskAssessmentError);
  });

  it("refuses negative points, which could cancel out a real risk factor", () => {
    expect(() =>
      RiskAssessment.of({
        subjectId: "inv-1",
        answers: [{ factorId: "geography", answer: "domestic", points: -5 }],
        thresholds,
        assessedBy: "officer-1",
        assessedAt: new Date(),
      }),
    ).toThrow(InvalidRiskAssessmentError);
  });

  it("refuses the same factor answered twice, which would double-count it", () => {
    expect(() =>
      RiskAssessment.of({
        subjectId: "inv-1",
        answers: [...answered, { factorId: "geography", answer: "foreign", points: 4 }],
        thresholds,
        assessedBy: "officer-1",
        assessedAt: new Date(),
      }),
    ).toThrow(InvalidRiskAssessmentError);
  });

  it("names an assessor, because an unattributed risk decision cannot be reviewed", () => {
    expect(() =>
      RiskAssessment.of({
        subjectId: "inv-1",
        answers: answered,
        thresholds,
        assessedBy: "   ",
        assessedAt: new Date(),
      }),
    ).toThrow(InvalidRiskAssessmentError);
  });

  it("keeps the band it was DECIDED with, even if today's thresholds disagree", () => {
    // Thresholds are configuration and will be re-tuned. Recomputing the band
    // on read would silently re-rate every historical file, so a rating that
    // was reviewed and signed off as medium could read as high a year later
    // with nothing recording that anything changed.
    const stored = RiskAssessment.rehydrate({
      subjectId: "inv-1",
      answers: answered,
      score: 1,
      band: "high",
      assessedBy: "officer-1",
      assessedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(stored.band).toBe("high");
    expect(stored.score).toBe(1);
    // And today's model would have said something else entirely.
    expect(bandFor(1, thresholds)).toBe("low");
  });

  it("says plainly that it decides nothing on its own", () => {
    const assessment = RiskAssessment.of({
      subjectId: "inv-1",
      answers: [{ factorId: "geography", answer: "foreign", points: 7 }],
      thresholds,
      assessedBy: "officer-1",
      assessedAt: new Date(),
    });

    expect(assessment.band).toBe("high");
    // High risk is a reason for a person to look harder, not an automatic
    // refusal: no rule in this codebase reads a band and rejects anybody.
    expect(assessment.advisoryNotice()).toMatch(/does not.*decide|advisory/i);
  });
});
