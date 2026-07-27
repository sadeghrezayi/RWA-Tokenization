import { Approval } from "../../domain/approvals/approval.js";
import type { IdGenerator } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import type { ApprovalParkedNotifier, ApprovalRepository, LedgerCredit } from "./ports.js";

// Engineering default pending a product/AML policy: credits at or above this
// amount require maker-checker approval. Purely a placeholder — requires local
// policy validation. Overridable via LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL.
export const DEFAULT_LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL = 10_000_000_000n;

export type CreditResult =
  { status: "credited" } | { status: "pending_approval"; approvalId: string };

// T1/T3 threshold maker-checker: a below-threshold credit executes directly; an
// at/above-threshold credit is parked as a pending approval for a second person.
export class CreditInvestorLedger {
  constructor(
    private readonly rail: LedgerCredit,
    private readonly approvals: ApprovalRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly thresholdRial: bigint,
    private readonly parkedNotifier: ApprovalParkedNotifier,
  ) {}

  async execute(input: {
    investorId: string;
    amountRial: bigint;
    makerId: string;
  }): Promise<CreditResult> {
    if (input.amountRial < this.thresholdRial) {
      await this.rail.credit(input.investorId, input.amountRial, input.makerId);
      return { status: "credited" };
    }

    const approval = Approval.request(
      this.ids.nextId(),
      "ledger.credit",
      { investorId: input.investorId, amountRial: input.amountRial.toString() },
      input.makerId,
      this.clock.now(),
    );
    await this.approvals.save(approval);
    await this.parkedNotifier.approvalParked(approval);
    return { status: "pending_approval", approvalId: approval.id };
  }
}
