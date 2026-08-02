import { StateMachine } from "../shared/state-machine.js";
import {
  InvalidFundingAmountError,
  InvalidFundingReferenceError,
  InvalidFundingTransitionError,
  MissingRejectionReasonError,
} from "./errors.js";

// OD-6 (user decision): money enters the platform as a BANK TRANSFER that a
// treasury officer confirms against a statement. This aggregate is the record
// of one such transfer — what the investor said they would send, the reference
// that ties a bank line to them, and what treasury actually saw arrive.
export type FundingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

// Every settled state is terminal. That is what stops a deposit being credited
// twice: a second confirmation has nowhere to go.
const FUNDING_MACHINE = new StateMachine<FundingStatus>({
  pending: ["confirmed", "rejected", "cancelled"],
});

export class FundingRequest {
  private constructor(
    public readonly id: string,
    public readonly investorId: string,
    // What the investor declared they would transfer.
    public readonly amountRial: bigint,
    public readonly reference: string,
    public readonly status: FundingStatus,
    public readonly requestedAt: Date,
    public readonly settledAt?: Date,
    // What treasury actually saw arrive. Deliberately separate from the
    // declared amount: a bank credits what was really sent.
    public readonly settledAmountRial?: bigint,
    public readonly rejectionReason?: string,
  ) {}

  static open(fields: {
    id: string;
    investorId: string;
    amountRial: bigint;
    reference: string;
    now: Date;
  }): FundingRequest {
    if (fields.amountRial <= 0n) {
      throw new InvalidFundingAmountError("a funding amount must be positive");
    }
    if (fields.reference.trim() === "") {
      throw new InvalidFundingReferenceError();
    }
    return new FundingRequest(
      fields.id,
      fields.investorId,
      fields.amountRial,
      fields.reference,
      "pending",
      fields.now,
    );
  }

  // Persistence-only: rehydrates a stored request without replaying transitions.
  static restore(fields: {
    id: string;
    investorId: string;
    amountRial: bigint;
    reference: string;
    status: FundingStatus;
    requestedAt: Date;
    settledAt?: Date;
    settledAmountRial?: bigint;
    rejectionReason?: string;
  }): FundingRequest {
    return new FundingRequest(
      fields.id,
      fields.investorId,
      fields.amountRial,
      fields.reference,
      fields.status,
      fields.requestedAt,
      fields.settledAt,
      fields.settledAmountRial,
      fields.rejectionReason,
    );
  }

  confirm(input: { receivedRial: bigint; now: Date }): FundingRequest {
    this.assertCan("confirm", "confirmed");
    if (input.receivedRial <= 0n) {
      throw new InvalidFundingAmountError("a confirmed receipt must be positive");
    }
    return this.settled("confirmed", input.now, { settledAmountRial: input.receivedRial });
  }

  reject(input: { reason: string; now: Date }): FundingRequest {
    this.assertCan("reject", "rejected");
    const reason = input.reason.trim();
    if (reason === "") {
      throw new MissingRejectionReasonError();
    }
    return this.settled("rejected", input.now, { rejectionReason: reason });
  }

  cancel(now: Date): FundingRequest {
    this.assertCan("cancel", "cancelled");
    return this.settled("cancelled", now, {});
  }

  private assertCan(action: string, to: FundingStatus): void {
    FUNDING_MACHINE.assertCanTransition(this.status, to, (from) => {
      throw new InvalidFundingTransitionError(action, from);
    });
  }

  private settled(
    status: FundingStatus,
    now: Date,
    extra: { settledAmountRial?: bigint; rejectionReason?: string },
  ): FundingRequest {
    return new FundingRequest(
      this.id,
      this.investorId,
      this.amountRial,
      this.reference,
      status,
      this.requestedAt,
      now,
      extra.settledAmountRial,
      extra.rejectionReason,
    );
  }
}
