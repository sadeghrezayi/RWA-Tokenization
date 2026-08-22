import { InvalidRiskAssessmentError } from "./errors.js";

// How much attention a file deserves from a person (4.2). Three bands, because
// the only distinction that changes anyone's behaviour is "handle normally",
// "look closer", "senior review" — a finer scale invites false precision about
// a judgement that is qualitative underneath.
export type RiskBand = "low" | "medium" | "high";

// Where the bands begin. Deliberately NOT constants in this file: what counts as
// high risk is policy, so it is supplied by configuration and validated here.
export interface RiskBandThresholds {
  medium: number;
  high: number;
}

export interface RiskFactorAnswer {
  factorId: string;
  answer: string;
  points: number;
}

const assertOrderedScale = (thresholds: RiskBandThresholds): void => {
  if (!Number.isFinite(thresholds.medium) || !Number.isFinite(thresholds.high)) {
    throw new InvalidRiskAssessmentError("risk thresholds must be numbers");
  }
  if (thresholds.medium < 0) {
    throw new InvalidRiskAssessmentError("risk thresholds cannot be negative");
  }
  if (thresholds.high <= thresholds.medium) {
    throw new InvalidRiskAssessmentError(
      "risk thresholds must ascend: the high band has to begin above the medium one",
    );
  }
};

// A score sitting exactly on a threshold belongs to the HIGHER band. Rounding
// the other way would quietly downgrade every borderline file.
export const bandFor = (score: number, thresholds: RiskBandThresholds): RiskBand => {
  assertOrderedScale(thresholds);
  if (score >= thresholds.high) {
    return "high";
  }
  return score >= thresholds.medium ? "medium" : "low";
};

// What a person concluded about one subject, at one moment, from answers to a
// configured set of factors.
//
// The central rule: there is no such thing as an empty assessment. An empty one
// would sum to zero, and zero reads as "low" — so a file nobody examined would
// present itself as cleared. Absence of an assessment is not a low risk, and
// this class refuses to express it as one.
export class RiskAssessment {
  private constructor(
    public readonly subjectId: string,
    public readonly answers: readonly RiskFactorAnswer[],
    public readonly score: number,
    public readonly band: RiskBand,
    public readonly assessedBy: string,
    public readonly assessedAt: Date,
  ) {}

  static of(fields: {
    subjectId: string;
    answers: readonly RiskFactorAnswer[];
    thresholds: RiskBandThresholds;
    assessedBy: string;
    assessedAt: Date;
  }): RiskAssessment {
    const subjectId = fields.subjectId.trim();
    if (subjectId === "") {
      throw new InvalidRiskAssessmentError("a risk assessment is about someone: subject required");
    }
    const assessedBy = fields.assessedBy.trim();
    if (assessedBy === "") {
      // An unattributed judgement cannot be questioned, defended, or reviewed.
      throw new InvalidRiskAssessmentError("a risk assessment must name who made it");
    }
    if (fields.answers.length === 0) {
      throw new InvalidRiskAssessmentError(
        "no risk factors were assessed — absence of an assessment is not a low risk",
      );
    }
    const seen = new Set<string>();
    let score = 0;
    for (const answer of fields.answers) {
      if (!Number.isFinite(answer.points) || answer.points < 0) {
        // A negative weight lets one answer cancel another's risk out of sight.
        throw new InvalidRiskAssessmentError(
          `factor "${answer.factorId}" carries invalid points: risk cannot be negative`,
        );
      }
      if (seen.has(answer.factorId)) {
        throw new InvalidRiskAssessmentError(
          `factor "${answer.factorId}" was answered twice, which would double-count it`,
        );
      }
      seen.add(answer.factorId);
      score += answer.points;
    }
    return new RiskAssessment(
      subjectId,
      [...fields.answers],
      score,
      bandFor(score, fields.thresholds),
      assessedBy,
      fields.assessedAt,
    );
  }

  // Rebuild an assessment that was already made. The band is taken VERBATIM,
  // never recomputed: thresholds are configuration and will be re-tuned, and
  // re-deriving the band on read would quietly re-rate files that a person
  // already reviewed and signed off — with nothing recording the change.
  static rehydrate(fields: {
    subjectId: string;
    answers: readonly RiskFactorAnswer[];
    score: number;
    band: RiskBand;
    assessedBy: string;
    assessedAt: Date;
  }): RiskAssessment {
    return new RiskAssessment(
      fields.subjectId,
      [...fields.answers],
      fields.score,
      fields.band,
      fields.assessedBy,
      fields.assessedAt,
    );
  }

  // Travels with the rating for the same reason the screening disclaimer travels
  // with the outcome: whoever reads "high" next must know what it is and is not.
  advisoryNotice(): string {
    return (
      "Advisory only — this rating does not decide anything on its own. " +
      "It directs how closely a person reviews the file; no approval, refusal or limit follows from it automatically."
    );
  }
}
