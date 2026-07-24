import { describe, expect, it } from "vitest";
import { Approval } from "../../../src/domain/approvals/approval.js";
import {
  InvalidApprovalTransitionError,
  SelfApprovalError,
} from "../../../src/domain/approvals/errors.js";

const NOW = new Date("2026-07-25T10:00:00Z");
const LATER = new Date("2026-07-25T11:00:00Z");

const pending = () =>
  Approval.request(
    "apr-1",
    "ledger.credit",
    { investorId: "inv-1", amountRial: "50000000000" },
    "officer-maker",
    NOW,
  );

describe("Approval (maker-checker)", () => {
  it("is_created_pending_by_the_maker", () => {
    const a = pending();
    expect(a.status).toBe("pending");
    expect(a.makerId).toBe("officer-maker");
    expect(a.action).toBe("ledger.credit");
    expect(a.payload).toEqual({ investorId: "inv-1", amountRial: "50000000000" });
    expect(a.checkerId).toBeUndefined();
  });

  it("is_approved_by_a_different_checker", () => {
    const a = pending().approve("officer-checker", LATER);
    expect(a.status).toBe("approved");
    expect(a.checkerId).toBe("officer-checker");
    expect(a.decidedAt).toEqual(LATER);
  });

  it("forbids_the_maker_from_approving_their_own_request", () => {
    expect(() => pending().approve("officer-maker", LATER)).toThrow(SelfApprovalError);
  });

  it("is_rejected_with_a_reason", () => {
    const a = pending().reject("officer-checker", "insufficient documentation", LATER);
    expect(a.status).toBe("rejected");
    expect(a.checkerId).toBe("officer-checker");
    expect(a.reason).toBe("insufficient documentation");
  });

  it("lets_the_maker_withdraw_their_own_request_by_rejecting", () => {
    const a = pending().reject("officer-maker", "changed my mind", LATER);
    expect(a.status).toBe("rejected");
  });

  it("cannot_be_decided_twice", () => {
    const approved = pending().approve("officer-checker", LATER);
    expect(() => approved.approve("officer-other", LATER)).toThrow(InvalidApprovalTransitionError);
    expect(() => approved.reject("officer-other", "no", LATER)).toThrow(
      InvalidApprovalTransitionError,
    );
  });

  it("restores_persisted_state_verbatim", () => {
    const a = Approval.restore({
      id: "apr-9",
      action: "ledger.credit",
      payload: { investorId: "inv-2", amountRial: "1" },
      makerId: "m",
      status: "approved",
      checkerId: "c",
      createdAt: NOW,
      decidedAt: LATER,
    });
    expect(a.status).toBe("approved");
    expect(a.checkerId).toBe("c");
  });
});
