import { InvalidApprovalTransitionError, SelfApprovalError } from "./errors.js";

export type ApprovalStatus = "pending" | "approved" | "rejected";

// The set of sensitive actions that route through maker-checker. Extensible;
// ledger.credit is the first (P1.4b).
export type ApprovalAction = "ledger.credit";

// Opaque action parameters, stored as strings so the aggregate stays free of
// any specific action's shape; the executor adapter interprets them.
export type ApprovalPayload = Record<string, string>;

export interface ApprovalSnapshot {
  id: string;
  action: ApprovalAction;
  payload: ApprovalPayload;
  makerId: string;
  status: ApprovalStatus;
  checkerId?: string;
  reason?: string;
  createdAt: Date;
  decidedAt?: Date;
}

// A pending sensitive action awaiting a second person's decision (T1/T3). The
// four-eyes invariant lives here: approve() rejects self-approval; a decided
// approval cannot be decided again.
export class Approval {
  private constructor(
    public readonly id: string,
    public readonly action: ApprovalAction,
    public readonly payload: ApprovalPayload,
    public readonly makerId: string,
    public readonly status: ApprovalStatus,
    public readonly createdAt: Date,
    public readonly checkerId?: string,
    public readonly reason?: string,
    public readonly decidedAt?: Date,
  ) {}

  static request(
    id: string,
    action: ApprovalAction,
    payload: ApprovalPayload,
    makerId: string,
    now: Date,
  ): Approval {
    return new Approval(id, action, { ...payload }, makerId, "pending", now);
  }

  static restore(s: ApprovalSnapshot): Approval {
    return new Approval(
      s.id,
      s.action,
      { ...s.payload },
      s.makerId,
      s.status,
      s.createdAt,
      s.checkerId,
      s.reason,
      s.decidedAt,
    );
  }

  approve(checkerId: string, now: Date): Approval {
    this.ensurePending();
    if (checkerId === this.makerId) {
      throw new SelfApprovalError();
    }
    return this.decided("approved", checkerId, now, undefined);
  }

  // Rejection may be by any reviewer, including the maker withdrawing their own
  // request — four-eyes only constrains APPROVAL, not cancellation.
  reject(checkerId: string, reason: string, now: Date): Approval {
    this.ensurePending();
    return this.decided("rejected", checkerId, now, reason);
  }

  private ensurePending(): void {
    if (this.status !== "pending") {
      throw new InvalidApprovalTransitionError();
    }
  }

  private decided(
    status: ApprovalStatus,
    checkerId: string,
    now: Date,
    reason: string | undefined,
  ): Approval {
    return new Approval(
      this.id,
      this.action,
      this.payload,
      this.makerId,
      status,
      this.createdAt,
      checkerId,
      reason,
      now,
    );
  }
}
