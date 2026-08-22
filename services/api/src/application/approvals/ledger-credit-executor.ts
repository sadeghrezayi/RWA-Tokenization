import type { Approval, ApprovalAction } from "../../domain/approvals/approval.js";
import type { ApprovalActionExecutor, DistributionPayout, LedgerCredit } from "./ports.js";

// Dispatches an approved sensitive action to its effect via an exhaustive
// handler map keyed by action — TS enforces a handler for every ApprovalAction,
// so adding an action forces adding its executor here. The maker is recorded as
// the acting party on the resulting effect.
export class ApprovalActionDispatcher implements ApprovalActionExecutor {
  constructor(
    private readonly rail: LedgerCredit,
    private readonly payout: DistributionPayout,
  ) {}

  async execute(approval: Approval): Promise<void> {
    const handlers: Record<ApprovalAction, (a: Approval) => Promise<void>> = {
      "ledger.credit": (a) => this.creditLedger(a),
      "distribution.pay": (a) => this.payDistribution(a),
    };
    await handlers[approval.action](approval);
  }

  private async payDistribution(approval: Approval): Promise<void> {
    const { distributionId } = approval.payload;
    if (distributionId === undefined) {
      throw new Error(`approval "${approval.id}" has an incomplete distribution.pay payload`);
    }
    // The maker is the acting party on the effect, as with a credit: the
    // checker authorised it, the maker asked for it.
    await this.payout.execute({ distributionId, actor: approval.makerId });
  }

  private async creditLedger(approval: Approval): Promise<void> {
    const { investorId, amountRial } = approval.payload;
    if (investorId === undefined || amountRial === undefined) {
      throw new Error(`approval "${approval.id}" has an incomplete ledger.credit payload`);
    }
    await this.rail.credit(investorId, BigInt(amountRial), approval.makerId);
  }
}
