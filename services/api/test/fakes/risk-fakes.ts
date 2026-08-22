import type { RiskAssessmentRepository } from "../../src/application/risk/ports.js";
import type { RiskAssessment } from "../../src/domain/risk/risk-rating.js";

// The reference implementation the Prisma adapter is held against.
export class InMemoryRiskAssessmentRepository implements RiskAssessmentRepository {
  private readonly rows: RiskAssessment[] = [];

  save(assessment: RiskAssessment): Promise<void> {
    this.rows.push(assessment);
    return Promise.resolve();
  }

  findForSubject(subjectId: string): Promise<RiskAssessment[]> {
    return Promise.resolve(this.rows.filter((row) => row.subjectId === subjectId));
  }
}
