import { describe, expect, it } from "vitest";
import { Investor } from "../../../src/domain/identity/investor.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { InvalidKycTransitionError } from "../../../src/domain/identity/errors.js";

const register = () => Investor.register("inv-1", EmailAddress.of("investor@example.com"));

describe("Investor", () => {
  it("registers_with_kyc_in_draft", () => {
    const investor = register();
    expect(investor.id).toBe("inv-1");
    expect(investor.email.value).toBe("investor@example.com");
    expect(investor.kycStatus.state).toBe("draft");
  });

  it("walks_the_happy_path_to_approved", () => {
    const approved = register().submitKyc().startKycReview().approveKyc();
    expect(approved.kycStatus.state).toBe("approved");
  });

  it("records_the_rejection_reason", () => {
    const rejected = register().submitKyc().startKycReview().rejectKyc("liveness check failed");
    expect(rejected.kycStatus.state).toBe("rejected");
    expect(rejected.kycStatus.rejectionReason).toBe("liveness check failed");
  });

  it("propagates_invalid_transitions_as_domain_errors", () => {
    expect(() => register().approveKyc()).toThrow(InvalidKycTransitionError);
  });

  it("is_immutable_transitions_return_a_new_investor", () => {
    const investor = register();
    const submitted = investor.submitKyc();
    expect(investor.kycStatus.state).toBe("draft");
    expect(submitted).not.toBe(investor);
    expect(submitted.id).toBe(investor.id);
  });

  it("restores_a_persisted_investor_verbatim", () => {
    const restored = Investor.restore(
      "inv-9",
      EmailAddress.of("stored@example.com"),
      KycStatus.restore("approved"),
    );
    expect(restored.id).toBe("inv-9");
    expect(restored.kycStatus.state).toBe("approved");
    expect(restored.isEligibleForClaims()).toBe(true);
  });

  // FR-ID-3: only approved investors may receive ONCHAINID claims.
  it("is_eligible_for_claims_only_when_approved", () => {
    const investor = register();
    expect(investor.isEligibleForClaims()).toBe(false);
    const approved = investor.submitKyc().startKycReview().approveKyc();
    expect(approved.isEligibleForClaims()).toBe(true);
    expect(approved.expireKyc().isEligibleForClaims()).toBe(false);
  });
});
