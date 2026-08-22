import type { RiskAssessmentRepository } from "./ports.js";
import type { RiskAssessment, RiskBand, RiskFactorAnswer } from "../../domain/risk/risk-rating.js";

export interface RiskAssessmentView {
  score: number;
  band: RiskBand;
  answers: readonly RiskFactorAnswer[];
  assessedBy: string;
  assessedAt: string;
  // Carried in the response for the same reason the screening disclaimer is:
  // whoever renders a band must be able to say what it does and does not mean,
  // without a second copy of those words living in the web app.
  advisory: string;
}

export const toRiskAssessmentView = (assessment: RiskAssessment): RiskAssessmentView => ({
  score: assessment.score,
  band: assessment.band,
  answers: assessment.answers,
  assessedBy: assessment.assessedBy,
  assessedAt: assessment.assessedAt.toISOString(),
  advisory: assessment.advisoryNotice(),
});

// Newest first: an officer opening a file wants the current rating, with the
// history under it.
export class ListRiskAssessments {
  constructor(private readonly assessments: RiskAssessmentRepository) {}

  async execute(input: { subjectId: string }): Promise<RiskAssessmentView[]> {
    const rows = await this.assessments.findForSubject(input.subjectId);
    return [...rows]
      .sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime())
      .map(toRiskAssessmentView);
  }
}
