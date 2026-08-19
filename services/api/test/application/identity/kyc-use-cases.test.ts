import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { StartKycReview } from "../../../src/application/identity/start-kyc-review.js";
import { ApproveKyc } from "../../../src/application/identity/approve-kyc.js";
import { ClaimIssuanceFailedError } from "../../../src/application/identity/errors.js";
import { RejectKyc } from "../../../src/application/identity/reject-kyc.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import { InvalidKycTransitionError } from "../../../src/domain/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  RecordingClaimIssuer,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";
import { RecordingKycDecisionNotifier } from "../../fakes/notification-fakes.js";

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const claims = new RecordingClaimIssuer();
  const kycNotifier = new RecordingKycDecisionNotifier();
  const register = new RegisterInvestor(
    investors,
    new SequentialIdGenerator(),
    new FakePasswordHasher(),
  );
  const { investorId } = await register.execute({
    email: "investor@example.com",
    password: "s3cure-pass",
  });
  return {
    investors,
    claims,
    kycNotifier,
    investorId,
    startReview: new StartKycReview(investors),
    approve: new ApproveKyc(investors, claims, kycNotifier),
    reject: new RejectKyc(investors, kycNotifier),
  };
};

const kycStateOf = async (investors: InMemoryInvestorRepository, id: string) =>
  (await investors.findById(id))?.kycStatus.state;

// 2.3e: submitting is the onboarding wizard's job now (it requires collected
// evidence). These officer-side use-cases only need an investor already in the
// queue, so the transition is made directly on the aggregate.
const submitted = async (investors: InMemoryInvestorRepository, id: string): Promise<void> => {
  const investor = await investors.findById(id);
  if (!investor) throw new Error("expected an investor");
  await investors.save(investor.submitKyc());
};

describe("StartKycReview", () => {
  it("moves_kyc_to_in_review_and_persists", async () => {
    const { investors, investorId, startReview } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    expect(await kycStateOf(investors, investorId)).toBe("in_review");
  });
});

describe("ApproveKyc", () => {
  it("persists_approval_and_issues_the_onchain_claim", async () => {
    const { investors, claims, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await approve.execute({ investorId });

    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(claims.issuedFor).toEqual([investorId]);
  });

  // K-2: the approval is persisted BEFORE the chain is touched, precisely so a
  // devnet outage cannot revert a compliance decision. But the chain failure
  // then aborted everything after it — so the investor was never told about a
  // decision that had already been committed, and the officer got a bare 500.
  it("tells the investor even when the chain claim cannot be issued", async () => {
    const { investors, claims, kycNotifier, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    await expect(approve.execute({ investorId })).rejects.toThrow(ClaimIssuanceFailedError);

    // The decision stands and the person it concerns has been told.
    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(kycNotifier.notices).toHaveLength(1);
  });

  it("says the approval stands and what is left to do, not just that something broke", async () => {
    const { investors, claims, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    const failure = await approve.execute({ investorId }).catch((error: unknown) => error);

    const message = (failure as Error).message;
    // An officer reading this must learn three things: the approval is
    // recorded, the chain part is not, and it can be retried.
    expect(message).toMatch(/approv/i);
    expect(message).toMatch(/chain|claim/i);
    expect(message).toMatch(/retr/i);
  });

  it("does_not_issue_a_claim_when_the_transition_is_invalid", async () => {
    const { investors, claims, kycNotifier, investorId, approve } = await setup();

    await expect(approve.execute({ investorId })).rejects.toThrow(InvalidKycTransitionError);

    expect(claims.issuedFor).toEqual([]);
    expect(await kycStateOf(investors, investorId)).toBe("draft");
    expect(kycNotifier.notices).toHaveLength(0); // nothing decided → nobody told
  });

  it("tells_the_investor_their_kyc_was_approved", async () => {
    const { investors, kycNotifier, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await approve.execute({ investorId });

    expect(kycNotifier.notices).toEqual([
      { investorId, email: "investor@example.com", decision: "approved" },
    ]);
  });

  it("keeps_the_persisted_approval_when_claim_issuance_fails", async () => {
    // Decided ordering: persist approval first, then issue the claim, so a chain
    // outage never silently reverts a compliance decision; issuance is retried.
    const { investors, claims, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("devnet unreachable");

    await expect(approve.execute({ investorId })).rejects.toThrow("devnet unreachable");

    expect(await kycStateOf(investors, investorId)).toBe("approved");
  });

  it("throws_for_an_unknown_investor", async () => {
    const { approve } = await setup();
    await expect(approve.execute({ investorId: "missing" })).rejects.toThrow(InvestorNotFoundError);
  });
});

describe("RejectKyc", () => {
  it("persists_rejection_with_its_reason", async () => {
    const { investors, investorId, startReview, reject } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await reject.execute({ investorId, reason: "liveness check failed" });

    const stored = await investors.findById(investorId);
    expect(stored?.kycStatus.state).toBe("rejected");
    expect(stored?.kycStatus.rejectionReason).toBe("liveness check failed");
  });

  it("tells_the_investor_their_kyc_was_rejected_and_why", async () => {
    const { investors, kycNotifier, investorId, startReview, reject } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await reject.execute({ investorId, reason: "liveness check failed" });

    expect(kycNotifier.notices).toEqual([
      {
        investorId,
        email: "investor@example.com",
        decision: "rejected",
        reason: "liveness check failed",
      },
    ]);
  });
});
