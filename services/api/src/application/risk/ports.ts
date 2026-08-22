import type { RiskAssessment } from "../../domain/risk/risk-rating.js";

// Append-only, exactly like screening results: a re-rating is a new judgement
// about a new moment, and overwriting the old one would erase the reasoning a
// reviewer may need to defend later.
export interface RiskAssessmentRepository {
  save(assessment: RiskAssessment): Promise<void>;
  findForSubject(subjectId: string): Promise<RiskAssessment[]>;
  // The CURRENT rating for everyone who has one — one row per subject, newest
  // wins. The periodic-review list depends on "newest": reading any other row
  // schedules a customer against a rating they no longer hold.
  latestPerSubject(): Promise<RiskAssessment[]>;
}
