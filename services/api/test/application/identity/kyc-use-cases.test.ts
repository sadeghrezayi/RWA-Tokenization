import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { StartKycReview } from "../../../src/application/identity/start-kyc-review.js";
import { ApproveKyc } from "../../../src/application/identity/approve-kyc.js";
import { KYC_CLAIM_OUTBOX_TYPE } from "../../../src/application/identity/kyc-claim-outbox.js";
import { ReissueKycClaim } from "../../../src/application/identity/reissue-kyc-claim.js";
import { ClaimIssuanceFailedError } from "../../../src/application/identity/errors.js";
import { RejectKyc } from "../../../src/application/identity/reject-kyc.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import { InvalidKycTransitionError } from "../../../src/domain/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  RecordingClaimIssuer,
  RecordingOutbox,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";
import { RecordingKycDecisionNotifier } from "../../fakes/notification-fakes.js";

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
    outbox,
    kycNotifier,
    investorId,
    startReview: new StartKycReview(investors),
    approve: new ApproveKyc(investors, outbox, kycNotifier),
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
    const { investors, outbox, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await approve.execute({ investorId });

    expect(await kycStateOf(investors, investorId)).toBe("approved");
    // P0-2: issued by the drainer now, so what the request guarantees is that
    // the instruction is durably recorded — in the same transaction as the
    // decision, which is the point of an outbox.
    expect(outbox.messages).toHaveLength(1);
    expect(outbox.messages[0]?.payload).toEqual({ investorId });
  });

  // The two tests that stood here checked what happened when the chain was
  // unreachable DURING approval: that the investor was still notified, and that
  // the officer got a message saying the approval stood. P0-2 removed that
  // situation rather than improving it — approval no longer touches the chain,
  // so there is no failure left to report. What those tests protected is now
  // covered by "still approves when the chain is unreachable" and by the
  // drainer's own retry and dead-lettering.
  //
  it("does_not_issue_a_claim_when_the_transition_is_invalid", async () => {
    const { investors, outbox, kycNotifier, investorId, approve } = await setup();

    await expect(approve.execute({ investorId })).rejects.toThrow(InvalidKycTransitionError);

    expect(outbox.messages).toEqual([]);
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

  it("keeps_the_persisted_approval_whatever_the_chain_is_doing", async () => {
    // The ordering this once protected — persist first, then issue, so an
    // outage could not revert a decision — is now structural: approval does not
    // issue anything. It records the instruction and returns.
    const { investors, claims, outbox, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("devnet unreachable");

    await expect(approve.execute({ investorId })).resolves.toBeUndefined();

    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(outbox.messages).toHaveLength(1);
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
    // Approval enqueues; nothing has reached the chain yet. This use case is
    // the manual path for the case where the drainer gave up and the message
    // dead-lettered — an officer's way to say "try that again now".
    await approve.execute({ investorId });
    expect(claims.issuedFor).toEqual([]);

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

// P0-2, for the KYC claim: the chain write moves behind the transactional
// outbox (decision B7 — "the outbox is the durability mechanism regardless of
// trigger"). An officer's approval must not fail because a devnet is down, and
// the claim must not be lost because it was.
describe("ApproveKyc via the outbox", () => {
  it("enqueues the claim instead of reaching for the chain in the request", async () => {
    const { investors, claims, outbox, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });

    await approve.execute({ investorId });

    // Nothing touched the chain inside the request.
    expect(claims.issuedFor).toEqual([]);
    expect(outbox.messages.map((message: { type: string }) => message.type)).toContain(
      KYC_CLAIM_OUTBOX_TYPE,
    );
    expect(outbox.messages[0]?.payload).toEqual({ investorId });
  });

  it("still approves when the chain is unreachable, because it never asked", async () => {
    const { investors, claims, kycNotifier, investorId, startReview, approve } = await setup();
    await submitted(investors, investorId);
    await startReview.execute({ investorId });
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    // The whole point of P0-2: a dependency being down is not the officer's
    // problem, and the decision is not lost.
    await expect(approve.execute({ investorId })).resolves.toBeUndefined();

    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(kycNotifier.notices).toHaveLength(1);
  });
});
