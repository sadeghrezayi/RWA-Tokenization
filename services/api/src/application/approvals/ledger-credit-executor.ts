import type { Approval, ApprovalAction } from "../../domain/approvals/approval.js";
import type { ApprovalActionExecutor, LedgerCredit } from "./ports.js";

// Dispatches an approved sensitive action to its effect via an exhaustive
// handler map keyed by action — TS enforces a handler for every ApprovalAction,
// so adding an action forces adding its executor here. The maker is recorded as
// the acting party on the resulting effect.
export class ApprovalActionDispatcher implements ApprovalActionExecutor {
  constructor(private readonly rail: LedgerCredit) {}

  async execute(approval: Approval): Promise<void> {
    const handlers: Record<ApprovalAction, (a: Approval) => Promise<void>> = {
      "ledger.credit": (a) => this.creditLedger(a),
    };
    await handlers[approval.action](approval);
  }

  private async creditLedger(approval: Approval): Promise<void> {
    const { investorId, amountRial } = approval.payload;
    if (investorId === undefined || amountRial === undefined) {
      throw new Error(`approval "${approval.id}" has an incomplete ledger.credit payload`);
    }
    await this.rail.credit(investorId, BigInt(amountRial), approval.makerId);
  }
}
