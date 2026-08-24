import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { StartKycReview } from "../../../src/application/identity/start-kyc-review.js";
import { ApproveKyc } from "../../../src/application/identity/approve-kyc.js";
import { ReissueKycClaim } from "../../../src/application/identity/reissue-kyc-claim.js";
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

// Records what the approval hands to the outbox when the chain is unreachable.
class RecordingOutbox {
  readonly enqueued: { type: string; payload: Record<string, unknown> }[] = [];
  enqueue(message: { type: string; payload: Record<string, unknown> }): Promise<void> {
    this.enqueued.push(message);
    return Promise.resolve();
  }
}

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const claims = new RecordingClaimIssuer();
  const outbox = new RecordingOutbox();
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
    outbox,
    investorId,
    startReview: new StartKycReview(investors),
    approve: new ApproveKyc(investors, claims, kycNotifier, outbox),
    reissue: new ReissueKycClaim(investors, claims),
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
  it("does NOT fail the approval when the chain is unreachable — it queues the claim", async () => {
    // P0-2 step 4. A devnet outage used to turn a KYC approval into a 503 that
    // an officer had to notice and retry by hand. The claim now goes to the
    // outbox and retries itself; the compliance decision is committed either
    // way, so failing the request added nothing but noise.
    //
    // The claim never landing is still visible: `approvedWithoutOnchainIdentity`
    // on the health probe counts exactly this, and ReissueKycClaim remains the
    // manual lever (K-2).
    const { investors, claims, kycNotifier, investorId, startReview, approve, outbox } =
      await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    await expect(approve.execute({ investorId })).resolves.toBeUndefined();

    expect(outbox.enqueued).toHaveLength(1);
    expect(outbox.enqueued[0]?.payload).toMatchObject({ investorId });

    // The decision stands and the person it concerns has been told.
    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(kycNotifier.notices).toHaveLength(1);
  });

  it("says the approval stands and what is left to do, not just that something broke", async () => {
    // Moved from approval to REISSUE in P0-2 step 4. Approval no longer fails
    // on a chain outage — it queues the claim — but the manual reissue still
    // does, and there K-2's wording still matters: an officer pressed the
    // button and is owed a real answer.
    const { investors, claims, investorId, startReview, approve, reissue } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    await approve.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    const failure = await reissue.execute({ investorId }).catch((error: unknown) => error);

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

    // The approval no longer fails (step 4) — it queues the claim — but the
    // guarantee this test exists for is unchanged: the compliance decision is
    // committed before the chain is touched and survives the outage.
    await expect(approve.execute({ investorId })).resolves.toBeUndefined();

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

// K-2's remainder. The approval is committed before the chain is touched, so a
// devnet outage leaves an investor APPROVED WITH NO ON-CHAIN CLAIM — and until
// now that was unrecoverable: `issueKycApprovedClaim` had exactly one caller,
// inside a transition that only runs once. ERC-3643 refuses transfers to an
// unverified wallet, so that investor could never hold anything, forever,
// short of editing the database by hand.
describe("ReissueKycClaim", () => {
  it("issues the claim again for an investor who is already approved", async () => {
    const { investors, claims, investorId, startReview, approve, reissue } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");
    // The approval succeeds and queues the claim (step 4); nothing reached the
    // chain, which is the state this recovery path exists for.
    await approve.execute({ investorId });
    expect(claims.issuedFor).toEqual([]);

    claims.failWith = undefined;
    await reissue.execute({ investorId });

    expect(claims.issuedFor).toEqual([investorId]);
    // The decision is untouched: this recovers the chain half, nothing else.
    expect(await kycStateOf(investors, investorId)).toBe("approved");
  });

  it("refuses to issue a claim for someone who was never approved", async () => {
    const { investors, claims, investorId, reissue } = await setup();
    await submitted(investors, investorId);

    await expect(reissue.execute({ investorId })).rejects.toThrow(InvalidKycTransitionError);

    expect(claims.issuedFor).toEqual([]);
  });

  it("still says what failed when the chain is unreachable", async () => {
    const { investors, claims, investorId, startReview, approve, reissue } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    await approve.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    await expect(reissue.execute({ investorId })).rejects.toThrow(ClaimIssuanceFailedError);
  });
});
