import { InvalidRiskAssessmentError } from "./errors.js";
import type { RiskBand } from "./risk-rating.js";

// How many months may pass before a customer in each band must be reviewed
// again. Supplied by the caller: the interval is policy, and this domain has no
// business inventing one.
export type ReviewCadenceMonths = Record<RiskBand, number>;

export type ReviewState = "never_reviewed" | "current" | "due" | "overdue";

export interface ReviewStatus {
  state: ReviewState;
  dueAt?: Date;
  // How late, so a queue can put the worst first instead of flattening every
  // late file into one undifferentiated "overdue".
  overdueByDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A file within this window of its due date is worth surfacing before it lapses.
const DUE_SOON_DAYS = 30;

export const nextReviewDue = (
  band: RiskBand,
  lastReviewedAt: Date,
  cadence: ReviewCadenceMonths,
): Date => {
  const months = cadence[band];
  if (!Number.isFinite(months) || months <= 0) {
    // Zero would mean "review continuously" and a negative one "never again";
    // both are policy mistakes that should fail loudly rather than silently
    // marking a whole population current.
    throw new InvalidRiskAssessmentError(
      `review cadence for "${band}" must be a positive number of months`,
    );
  }
  const due = new Date(lastReviewedAt.getTime());
  due.setUTCMonth(due.getUTCMonth() + months);
  return due;
};

// Where one customer stands against the schedule.
//
// A customer nobody has ever reviewed is `never_reviewed`, NOT `current`. The
// trap this avoids is the same one the empty risk assessment avoids: treating
// an absence of information as a clean result would put exactly the people
// nobody has looked at at the bottom of every list.
export const reviewStatusOf = (input: {
  lastReview: { band: RiskBand; at: Date } | undefined;
  now: Date;
  cadence: ReviewCadenceMonths;
}): ReviewStatus => {
  if (input.lastReview === undefined) {
    // Keys OMITTED, not set to undefined: with exactOptionalPropertyTypes
    // those are different types, and there genuinely is no due date to give.
    return { state: "never_reviewed" };
  }
  const dueAt = nextReviewDue(input.lastReview.band, input.lastReview.at, input.cadence);
  const msLate = input.now.getTime() - dueAt.getTime();
  if (msLate >= 0) {
    // The due date itself counts as due: a review "scheduled for today" that is
    // reported as still-current simply never happens.
    return { state: "overdue", dueAt, overdueByDays: Math.floor(msLate / DAY_MS) };
  }
  const daysLeft = Math.ceil(-msLate / DAY_MS);
  return daysLeft <= DUE_SOON_DAYS ? { state: "due", dueAt } : { state: "current", dueAt };
};
