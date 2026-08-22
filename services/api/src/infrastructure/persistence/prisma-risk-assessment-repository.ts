import type { PrismaClient } from "@prisma/client";
import { RiskAssessment } from "../../domain/risk/risk-rating.js";
import type { RiskBand, RiskFactorAnswer } from "../../domain/risk/risk-rating.js";
import type { RiskAssessmentRepository } from "../../application/risk/ports.js";
import type { IdGenerator } from "../../application/identity/ports.js";

const BANDS: readonly RiskBand[] = ["low", "medium", "high"];

// A band read back from the database must be one the domain recognises. A row
// carrying anything else is corrupt, and guessing on its behalf — defaulting to
// "low" — would turn corruption into a clean bill of health.
const toBand = (stored: string): RiskBand => {
  const band = BANDS.find((candidate) => candidate === stored);
  if (band === undefined) {
    throw new Error(`stored risk assessment has an unknown band "${stored}"`);
  }
  return band;
};

const toAnswers = (stored: unknown): RiskFactorAnswer[] => {
  if (!Array.isArray(stored)) {
    throw new Error("stored risk assessment has no answers: its reasoning is unreadable");
  }
  return stored.map((row) => {
    const answer = row as Partial<RiskFactorAnswer>;
    if (
      typeof answer.factorId !== "string" ||
      typeof answer.answer !== "string" ||
      typeof answer.points !== "number"
    ) {
      throw new Error("stored risk assessment has a malformed answer");
    }
    return { factorId: answer.factorId, answer: answer.answer, points: answer.points };
  });
};

// Append-only: `save` always inserts. A re-rating is a new judgement about a new
// moment, so there is deliberately no upsert here.
export class PrismaRiskAssessmentRepository implements RiskAssessmentRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
  ) {}

  async save(assessment: RiskAssessment): Promise<void> {
    await this.prisma.riskAssessment.create({
      data: {
        id: this.ids.nextId(),
        subjectId: assessment.subjectId,
        // The reasoning, not just the verdict: a band nobody can explain cannot
        // be reviewed, defended, or corrected.
        // Mapped field-by-field rather than spread: Prisma's Json input type
        // will not take the domain's readonly shape, and an explicit mapping is
        // also what makes a dropped field a compile error instead of a silent
        // loss of the reasoning.
        answers: assessment.answers.map((answer) => ({
          factorId: answer.factorId,
          answer: answer.answer,
          points: answer.points,
        })),
        score: assessment.score,
        band: assessment.band,
        assessedBy: assessment.assessedBy,
        assessedAt: assessment.assessedAt,
      },
    });
  }

  async findForSubject(subjectId: string): Promise<RiskAssessment[]> {
    const rows = await this.prisma.riskAssessment.findMany({
      where: { subjectId },
      orderBy: { assessedAt: "asc" },
    });
    return rows.map((row) =>
      // rehydrate, not of(): the band is what was DECIDED, and today's
      // thresholds must not re-rate a file somebody already signed off.
      RiskAssessment.rehydrate({
        subjectId: row.subjectId,
        answers: toAnswers(row.answers),
        score: row.score,
        band: toBand(row.band),
        assessedBy: row.assessedBy,
        assessedAt: row.assessedAt,
      }),
    );
  }
}
