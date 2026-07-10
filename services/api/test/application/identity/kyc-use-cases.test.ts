import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { SubmitKyc } from "../../../src/application/identity/submit-kyc.js";
import { StartKycReview } from "../../../src/application/identity/start-kyc-review.js";
import { ApproveKyc } from "../../../src/application/identity/approve-kyc.js";
import { RejectKyc } from "../../../src/application/identity/reject-kyc.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import { InvalidKycTransitionError } from "../../../src/domain/identity/errors.js";
import {
  InMemoryInvestorRepository,
  RecordingClaimIssuer,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const claims = new RecordingClaimIssuer();
  const register = new RegisterInvestor(investors, new SequentialIdGenerator());
  const { investorId } = await register.execute({ email: "investor@example.com" });
  return {
    investors,
    claims,
    investorId,
    submit: new SubmitKyc(investors),
    startReview: new StartKycReview(investors),
    approve: new ApproveKyc(investors, claims),
    reject: new RejectKyc(investors),
  };
};

const kycStateOf = async (investors: InMemoryInvestorRepository, id: string) =>
  (await investors.findById(id))?.kycStatus.state;

describe("SubmitKyc", () => {
  it("moves_kyc_to_submitted_and_persists", async () => {
    const { investors, investorId, submit } = await setup();
    await submit.execute({ investorId });
    expect(await kycStateOf(investors, investorId)).toBe("submitted");
  });

  it("throws_for_an_unknown_investor", async () => {
    const { submit } = await setup();
    await expect(submit.execute({ investorId: "missing" })).rejects.toThrow(InvestorNotFoundError);
  });
});

describe("StartKycReview", () => {
  it("moves_kyc_to_in_review_and_persists", async () => {
    const { investors, investorId, submit, startReview } = await setup();
    await submit.execute({ investorId });
    await startReview.execute({ investorId });
    expect(await kycStateOf(investors, investorId)).toBe("in_review");
  });
});

describe("ApproveKyc", () => {
  it("persists_approval_and_issues_the_onchain_claim", async () => {
    const { investors, claims, investorId, submit, startReview, approve } = await setup();
    await submit.execute({ investorId });
    await startReview.execute({ investorId });

    await approve.execute({ investorId });

    expect(await kycStateOf(investors, investorId)).toBe("approved");
    expect(claims.issuedFor).toEqual([investorId]);
  });

  it("does_not_issue_a_claim_when_the_transition_is_invalid", async () => {
    const { investors, claims, investorId, approve } = await setup();

    await expect(approve.execute({ investorId })).rejects.toThrow(InvalidKycTransitionError);

    expect(claims.issuedFor).toEqual([]);
    expect(await kycStateOf(investors, investorId)).toBe("draft");
  });

  it("keeps_the_persisted_approval_when_claim_issuance_fails", async () => {
    // Decided ordering: persist approval first, then issue the claim, so a chain
    // outage never silently reverts a compliance decision; issuance is retried.
    const { investors, claims, investorId, submit, startReview, approve } = await setup();
    await submit.execute({ investorId });
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
    const { investors, investorId, submit, startReview, reject } = await setup();
    await submit.execute({ investorId });
    await startReview.execute({ investorId });

    await reject.execute({ investorId, reason: "liveness check failed" });

    const stored = await investors.findById(investorId);
    expect(stored?.kycStatus.state).toBe("rejected");
    expect(stored?.kycStatus.rejectionReason).toBe("liveness check failed");
  });
});
