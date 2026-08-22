import { beforeEach, describe, expect, it } from "vitest";
import { AssessRisk } from "../../../src/application/risk/assess-risk.js";
import { RISK_MODEL } from "../../../src/application/risk/risk-model.js";
import { IncompleteRiskAssessmentError } from "../../../src/application/risk/errors.js";
import { InMemoryRiskAssessmentRepository } from "../../fakes/risk-fakes.js";

// Answers every factor the configured model asks for, so a test about one rule
// never fails for the unrelated reason that the catalogue grew a field.
const completeAnswers = (overrides: Record<string, string> = {}): Record<string, string> => {
  const answers: Record<string, string> = {};
  for (const factor of RISK_MODEL.factors) {
    answers[factor.id] = factor.options[0]?.value ?? "";
  }
  return { ...answers, ...overrides };
};

describe("AssessRisk", () => {
  let repository: InMemoryRiskAssessmentRepository;
  let assess: AssessRisk;

  beforeEach(() => {
    repository = new InMemoryRiskAssessmentRepository();
    assess = new AssessRisk(repository);
  });

  it("scores the answers against the configured model and files the result", async () => {
    const assessment = await assess.execute({
      subjectId: "inv-1",
      answers: completeAnswers(),
      assessedBy: "officer-1",
    });

    expect(assessment.subjectId).toBe("inv-1");
    expect(assessment.answers).toHaveLength(RISK_MODEL.factors.length);
    expect(await repository.findForSubject("inv-1")).toHaveLength(1);
  });

  it("REFUSES a partial assessment rather than scoring the factors it happens to have", async () => {
    // A file missing half its factors would score low simply for being
    // incomplete. The unanswered factor is named so the officer knows what to
    // go and answer.
    const skipped = RISK_MODEL.factors[0]?.id ?? "";
    const answers = Object.fromEntries(
      Object.entries(completeAnswers()).filter(([factorId]) => factorId !== skipped),
    );

    await expect(
      assess.execute({ subjectId: "inv-1", answers, assessedBy: "officer-1" }),
    ).rejects.toThrow(IncompleteRiskAssessmentError);
    expect(await repository.findForSubject("inv-1")).toHaveLength(0);
  });

  it("refuses an answer the model does not offer, instead of scoring it zero", async () => {
    const factor = RISK_MODEL.factors[0];
    if (factor === undefined) throw new Error("the risk model must have at least one factor");

    await expect(
      assess.execute({
        subjectId: "inv-1",
        answers: completeAnswers({ [factor.id]: "something-nobody-defined" }),
        assessedBy: "officer-1",
      }),
    ).rejects.toThrow(IncompleteRiskAssessmentError);
    expect(await repository.findForSubject("inv-1")).toHaveLength(0);
  });

  it("ignores a factor the model does not ask about rather than smuggling points in", async () => {
    // Points must come from the catalogue, never from the caller: otherwise the
    // HTTP layer could invent a factor and move somebody's band.
    const assessment = await assess.execute({
      subjectId: "inv-1",
      answers: completeAnswers({ invented_factor: "very-risky" }),
      assessedBy: "officer-1",
    });

    expect(assessment.answers.map((a) => a.factorId)).not.toContain("invented_factor");
    expect(assessment.answers).toHaveLength(RISK_MODEL.factors.length);
  });

  it("keeps every assessment, because a re-rating is a new judgement not a correction", async () => {
    await assess.execute({
      subjectId: "inv-1",
      answers: completeAnswers(),
      assessedBy: "officer-1",
    });
    await assess.execute({
      subjectId: "inv-1",
      answers: completeAnswers(),
      assessedBy: "officer-2",
    });

    expect(await repository.findForSubject("inv-1")).toHaveLength(2);
  });
});

describe("RISK_MODEL", () => {
  it("is marked provisional and says it requires local legal validation", () => {
    // The same posture as the onboarding field set: this codebase asserts
    // compliance with no regime, and whoever reads the screen is told so.
    expect(RISK_MODEL.provisional).toBe(true);
    expect(RISK_MODEL.notice).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);
  });

  it("offers no factor whose answers are all worth the same, which would be decoration", () => {
    for (const factor of RISK_MODEL.factors) {
      const points = new Set(factor.options.map((o) => o.points));
      expect(points.size).toBeGreaterThan(1);
    }
  });

  it("cannot produce a score that no band would call high", () => {
    // If every answer were worth 0 or the thresholds sat above the maximum
    // possible score, the model could never flag anyone — a rating system that
    // rates nobody is worse than none, because it looks like diligence.
    const maximum = RISK_MODEL.factors.reduce(
      (total, factor) => total + Math.max(...factor.options.map((o) => o.points)),
      0,
    );
    expect(maximum).toBeGreaterThanOrEqual(RISK_MODEL.thresholds.high);
  });
});
