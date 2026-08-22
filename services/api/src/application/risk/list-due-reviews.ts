import { REVIEW_CADENCE } from "./risk-model.js";
import type { RiskAssessmentRepository } from "./ports.js";
import { reviewStatusOf } from "../../domain/risk/review-schedule.js";
import type { ReviewState } from "../../domain/risk/review-schedule.js";
import type { RiskBand } from "../../domain/risk/risk-rating.js";
import type { InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";

export interface DueReviewView {
  investorId: string;
  email: string;
  state: ReviewState;
  band?: RiskBand;
  lastReviewedAt?: string;
  dueAt?: string;
  overdueByDays?: number;
}

// 4.2: which approved customers are due a periodic review.
//
// Only APPROVED customers appear: someone still in onboarding is in front of an
// officer already, and listing them here would bury the people whose file has
// gone quiet — which is the whole point of the list.
//
// A customer nobody has ever rated is listed as `never_reviewed`, not omitted.
// Omitting them would mean the list is quietest about exactly the files no
// record covers.
export class ListDueReviews {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly assessments: RiskAssessmentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DueReviewView[]> {
    const approved = await this.investors.findByKycStates(["approved"]);
    if (approved.length === 0) {
      return [];
    }
    // One row per customer, newest wins — scheduling against a superseded
    // rating would apply the wrong cadence in both directions.
    const latest = new Map(
      (await this.assessments.latestPerSubject()).map((row) => [row.subjectId, row]),
    );
    const now = this.clock.now();

    const due: DueReviewView[] = [];
    for (const investor of approved) {
      const current = latest.get(investor.id);
      const status = reviewStatusOf({
        lastReview:
          current === undefined ? undefined : { band: current.band, at: current.assessedAt },
        now,
        cadence: REVIEW_CADENCE.months,
      });
      if (status.state === "current") {
        continue;
      }
      due.push({
        investorId: investor.id,
        email: investor.email.value,
        state: status.state,
        ...(current === undefined
          ? {}
          : { band: current.band, lastReviewedAt: current.assessedAt.toISOString() }),
        ...(status.dueAt === undefined ? {} : { dueAt: status.dueAt.toISOString() }),
        ...(status.overdueByDays === undefined ? {} : { overdueByDays: status.overdueByDays }),
      });
    }

    // Worst first: never-reviewed ahead of overdue, then by how late. A list
    // that hides its worst case behind alphabetical order is not a work list.
    const rank: Record<ReviewState, number> = {
      never_reviewed: 0,
      overdue: 1,
      due: 2,
      current: 3,
    };
    return due.sort(
      (a, b) => rank[a.state] - rank[b.state] || (b.overdueByDays ?? 0) - (a.overdueByDays ?? 0),
    );
  }
}
