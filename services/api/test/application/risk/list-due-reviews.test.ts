import { beforeEach, describe, expect, it } from "vitest";
import { ListDueReviews } from "../../../src/application/risk/list-due-reviews.js";
import { REVIEW_CADENCE } from "../../../src/application/risk/risk-model.js";
import { RiskAssessment } from "../../../src/domain/risk/risk-rating.js";
import { InMemoryRiskAssessmentRepository } from "../../fakes/risk-fakes.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import type { InvestorRepository } from "../../../src/application/identity/ports.js";

const NOW = new Date("2026-08-22T00:00:00.000Z");

// Investor is immutable: each transition returns a new instance, so the chain
// is the state — assigning and calling in place would silently keep a draft.
const approved = (id: string): Investor =>
  Investor.register(id, EmailAddress.of(`${id}@review.example`), PasswordHash.of("x".repeat(60)))
    .submitKyc()
    .startKycReview()
    .approveKyc();

// The whole port, not a cast: the methods this use case must never reach throw
// rather than returning something plausible, so if it ever starts loading
// investors another way, this test says so instead of quietly passing.
class FakeInvestors implements InvestorRepository {
  constructor(private readonly rows: Investor[]) {}
  findByKycStates(): Promise<Investor[]> {
    return Promise.resolve(this.rows);
  }
  findById(): Promise<Investor | undefined> {
    throw new Error("the due-review list must read approved customers as a set");
  }
  findByEmail(): Promise<Investor | undefined> {
    throw new Error("the due-review list has no business looking anyone up by email");
  }
  findAll(): Promise<Investor[]> {
    throw new Error("the due-review list must not scan every investor ever registered");
  }
  save(): Promise<void> {
    throw new Error("listing due reviews must not write anything");
  }
}

const rated = (subjectId: string, band: "low" | "high", at: Date): RiskAssessment =>
  RiskAssessment.rehydrate({
    subjectId,
    answers: [{ factorId: "geography", answer: "domestic", points: band === "high" ? 9 : 0 }],
    score: band === "high" ? 9 : 0,
    band,
    assessedBy: "officer-1",
    assessedAt: at,
  });

describe("ListDueReviews", () => {
  let assessments: InMemoryRiskAssessmentRepository;

  const list = (investors: Investor[]) =>
    new ListDueReviews(new FakeInvestors(investors), assessments, { now: () => NOW });

  beforeEach(() => {
    assessments = new InMemoryRiskAssessmentRepository();
  });

  it("lists an approved customer NOBODY has ever rated as never reviewed", async () => {
    // The people most likely to need looking at are the ones no record covers.
    const due = await list([approved("inv-1")]).execute();

    expect(due).toHaveLength(1);
    expect(due[0]?.state).toBe("never_reviewed");
    expect(due[0]?.investorId).toBe("inv-1");
  });

  it("leaves out a customer whose review is not yet due", async () => {
    await assessments.save(rated("inv-1", "low", new Date("2026-01-01T00:00:00.000Z")));

    expect(await list([approved("inv-1")]).execute()).toEqual([]);
  });

  it("puts the most overdue first, so the worst is not buried", async () => {
    await assessments.save(rated("inv-1", "high", new Date("2025-06-01T00:00:00.000Z")));
    await assessments.save(rated("inv-2", "high", new Date("2024-01-01T00:00:00.000Z")));

    const due = await list([approved("inv-1"), approved("inv-2")]).execute();

    expect(due.map((row) => row.investorId)).toEqual(["inv-2", "inv-1"]);
    expect(due[0]?.state).toBe("overdue");
  });

  it("schedules against the CURRENT rating, not an old one", async () => {
    // Rated low three years ago, re-rated high last month: the high cadence
    // applies, so they are not due yet. Reading the stale row would have
    // called them overdue and, worse, the reverse case would hide a lapse.
    await assessments.save(rated("inv-1", "low", new Date("2023-08-01T00:00:00.000Z")));
    await assessments.save(rated("inv-1", "high", new Date("2026-07-01T00:00:00.000Z")));

    expect(await list([approved("inv-1")]).execute()).toEqual([]);
  });

  it("says how the cadence was decided, since it is not a rule this platform owns", () => {
    expect(REVIEW_CADENCE.provisional).toBe(true);
    expect(REVIEW_CADENCE.notice).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);
    // A higher band must never be reviewed less often than a lower one.
    expect(REVIEW_CADENCE.months.high).toBeLessThan(REVIEW_CADENCE.months.medium);
    expect(REVIEW_CADENCE.months.medium).toBeLessThan(REVIEW_CADENCE.months.low);
  });
});
