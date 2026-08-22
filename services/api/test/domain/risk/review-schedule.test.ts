import { describe, expect, it } from "vitest";
import { reviewStatusOf, nextReviewDue } from "../../../src/domain/risk/review-schedule.js";
import { InvalidRiskAssessmentError } from "../../../src/domain/risk/errors.js";

// Months, per band. Deliberately supplied by the caller — how often a customer
// must be reviewed is policy, not a constant this domain gets to invent.
const cadence = { low: 36, medium: 24, high: 12 };
const NOW = new Date("2026-08-22T00:00:00.000Z");

describe("nextReviewDue", () => {
  it("schedules a high-risk customer sooner than a low-risk one", () => {
    const reviewed = new Date("2026-01-01T00:00:00.000Z");

    expect(nextReviewDue("high", reviewed, cadence).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextReviewDue("low", reviewed, cadence).toISOString()).toBe("2029-01-01T00:00:00.000Z");
  });

  it("refuses a cadence that never comes due", () => {
    // A zero or negative interval would mean "review continuously" or "never
    // again"; both are policy mistakes worth failing loudly on.
    expect(() => nextReviewDue("low", NOW, { ...cadence, low: 0 })).toThrow(
      InvalidRiskAssessmentError,
    );
  });
});

describe("reviewStatusOf", () => {
  it("says a customer NOBODY has reviewed is due now, not 'not due'", () => {
    // The same trap as an unrated file reading as low risk: with no review on
    // record, silence would place them at the bottom of every list.
    expect(reviewStatusOf({ lastReview: undefined, now: NOW, cadence })).toEqual({
      state: "never_reviewed",
      dueAt: undefined,
      overdueByDays: undefined,
    });
  });

  it("distinguishes a review that is merely due from one that is overdue", () => {
    const current = reviewStatusOf({
      lastReview: { band: "high", at: new Date("2026-08-01T00:00:00.000Z") },
      now: NOW,
      cadence,
    });
    expect(current.state).toBe("current");

    const overdue = reviewStatusOf({
      lastReview: { band: "high", at: new Date("2025-01-01T00:00:00.000Z") },
      now: NOW,
      cadence,
    });
    expect(overdue.state).toBe("overdue");
    // How late it is, so a queue can put the worst first rather than listing
    // "overdue" against everyone equally.
    expect(overdue.overdueByDays).toBeGreaterThan(200);
  });

  it("treats the due date itself as due, not as still-current", () => {
    const at = new Date("2025-08-22T00:00:00.000Z");
    // Exactly twelve months earlier for a high-risk customer.
    expect(reviewStatusOf({ lastReview: { band: "high", at }, now: NOW, cadence }).state).toBe(
      "overdue",
    );
  });
});
