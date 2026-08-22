import { IncompleteRiskAssessmentError } from "./errors.js";
import type { RiskAssessmentRepository } from "./ports.js";
import { RISK_MODEL } from "./risk-model.js";
import type { RiskFactorAnswer } from "../../domain/risk/risk-rating.js";
import { RiskAssessment } from "../../domain/risk/risk-rating.js";

// 4.2: rate one applicant against the configured risk model and keep the
// judgement.
//
// Points come from the CATALOGUE, never from the caller. If the HTTP layer
// could supply weights, anyone able to reach the endpoint could move a person's
// band without leaving a trace of having done so.
export class AssessRisk {
  constructor(private readonly assessments: RiskAssessmentRepository) {}

  async execute(input: {
    subjectId: string;
    answers: Record<string, string>;
    assessedBy: string;
    now?: Date;
  }): Promise<RiskAssessment> {
    const answers: RiskFactorAnswer[] = [];
    for (const factor of RISK_MODEL.factors) {
      const given = input.answers[factor.id];
      if (given === undefined || given.trim() === "") {
        // Named, so the officer knows exactly what is still open.
        throw new IncompleteRiskAssessmentError(
          `"${factor.label}" has not been answered — a partial assessment would score low simply for being incomplete`,
        );
      }
      const option = factor.options.find((candidate) => candidate.value === given);
      if (option === undefined) {
        throw new IncompleteRiskAssessmentError(
          `"${given}" is not one of the answers the model offers for "${factor.label}"`,
        );
      }
      answers.push({ factorId: factor.id, answer: option.value, points: option.points });
    }

    const assessment = RiskAssessment.of({
      subjectId: input.subjectId,
      answers,
      thresholds: RISK_MODEL.thresholds,
      assessedBy: input.assessedBy,
      assessedAt: input.now ?? new Date(),
    });
    await this.assessments.save(assessment);
    return assessment;
  }
}
