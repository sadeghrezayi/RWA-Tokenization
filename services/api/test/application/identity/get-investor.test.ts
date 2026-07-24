import { describe, expect, it } from "vitest";
import { GetInvestor } from "../../../src/application/identity/get-investor.js";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { RejectKyc } from "../../../src/application/identity/reject-kyc.js";
import { SubmitKyc } from "../../../src/application/identity/submit-kyc.js";
import { StartKycReview } from "../../../src/application/identity/start-kyc-review.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const register = new RegisterInvestor(
    investors,
    new SequentialIdGenerator(),
    new FakePasswordHasher(),
  );
  const { investorId } = await register.execute({
    email: "investor@example.com",
    password: "s3cure-pass",
  });
  return { investors, investorId, getInvestor: new GetInvestor(investors) };
};

describe("GetInvestor", () => {
  it("returns_the_investor_view", async () => {
    const { investorId, getInvestor } = await setup();

    const view = await getInvestor.execute({ investorId });

    expect(view).toEqual({
      id: investorId,
      email: "investor@example.com",
      emailVerified: false, // freshly registered — unverified until confirmed
      kycState: "draft",
      eligibleForClaims: false,
    });
  });

  it("includes_the_rejection_reason_when_rejected", async () => {
    const { investors, investorId, getInvestor } = await setup();
    await new SubmitKyc(investors).execute({ investorId });
    await new StartKycReview(investors).execute({ investorId });
    await new RejectKyc(investors).execute({ investorId, reason: "document mismatch" });

    const view = await getInvestor.execute({ investorId });

    expect(view.kycState).toBe("rejected");
    expect(view.kycRejectionReason).toBe("document mismatch");
  });

  it("throws_for_an_unknown_investor", async () => {
    const { getInvestor } = await setup();
    await expect(getInvestor.execute({ investorId: "missing" })).rejects.toThrow(
      InvestorNotFoundError,
    );
  });
});
