import { describe, expect, it } from "vitest";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import {
  InvalidKycTransitionError,
  InvalidRejectionReasonError,
} from "../../../src/domain/identity/errors.js";

// FR-ID-2: KYC states draft → submitted → in_review → approved / rejected / expired

describe("KycStatus lifecycle", () => {
  it("starts_in_draft", () => {
    expect(KycStatus.draft().state).toBe("draft");
  });

  it("moves_from_draft_to_submitted_on_submit", () => {
    expect(KycStatus.draft().submit().state).toBe("submitted");
  });

  it("moves_from_submitted_to_in_review_on_start_review", () => {
    expect(KycStatus.draft().submit().startReview().state).toBe("in_review");
  });

  it("moves_from_in_review_to_approved_on_approve", () => {
    expect(KycStatus.draft().submit().startReview().approve().state).toBe("approved");
  });

  it("moves_from_in_review_to_rejected_with_reason_on_reject", () => {
    const rejected = KycStatus.draft().submit().startReview().reject("document mismatch");
    expect(rejected.state).toBe("rejected");
    expect(rejected.rejectionReason).toBe("document mismatch");
  });

  it("moves_from_approved_to_expired_on_expire", () => {
    expect(KycStatus.draft().submit().startReview().approve().expire().state).toBe("expired");
  });

  it("is_immutable_prior_status_is_unchanged_by_transition", () => {
    const draft = KycStatus.draft();
    draft.submit();
    expect(draft.state).toBe("draft");
  });

  it("rejects_reject_with_blank_reason", () => {
    const inReview = KycStatus.draft().submit().startReview();
    expect(() => inReview.reject("   ")).toThrow(InvalidRejectionReasonError);
  });

  it("rejects_approve_from_draft", () => {
    expect(() => KycStatus.draft().approve()).toThrow(InvalidKycTransitionError);
  });

  it("rejects_submit_when_already_submitted", () => {
    expect(() => KycStatus.draft().submit().submit()).toThrow(InvalidKycTransitionError);
  });

  it("rejects_start_review_from_rejected", () => {
    const rejected = KycStatus.draft().submit().startReview().reject("incomplete");
    expect(() => rejected.startReview()).toThrow(InvalidKycTransitionError);
  });

  it("reports_the_state_violation_when_reject_is_invalid_for_both_state_and_reason", () => {
    expect(() => KycStatus.draft().reject("  ")).toThrow(InvalidKycTransitionError);
  });

  it("rejects_expire_when_not_approved", () => {
    expect(() => KycStatus.draft().expire()).toThrow(InvalidKycTransitionError);
  });

  // Persistence-only rehydration seam: adapters restore a status without replaying transitions.
  it("restores_a_persisted_state_verbatim", () => {
    expect(KycStatus.restore("approved").state).toBe("approved");
    const rejected = KycStatus.restore("rejected", "document mismatch");
    expect(rejected.rejectionReason).toBe("document mismatch");
  });

  it("restored_status_still_enforces_transitions", () => {
    expect(KycStatus.restore("approved").expire().state).toBe("expired");
    expect(() => KycStatus.restore("expired").submit()).toThrow(InvalidKycTransitionError);
  });

  it("names_the_invalid_transition_in_the_error", () => {
    expect(() => KycStatus.draft().approve()).toThrow(/approve.*draft/);
  });
});
