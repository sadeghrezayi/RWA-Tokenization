import type { Approval } from "../../domain/approvals/approval.js";
import type { Clock } from "../offerings/ports.js";
import { ApprovalNotFoundError } from "./errors.js";
import type { ApprovalActionExecutor, ApprovalRepository } from "./ports.js";

// T1/T3 maker-checker decision. Approve enforces four-eyes (Approval.approve
// throws SelfApprovalError if checker === maker) and then runs the action.
//
// Ordering (money-safety): the approved state is persisted BEFORE the action
// runs, so a decided approval can never be approved (or executed) twice. If the
// executor then fails, the approval is left "approved" but un-effected — visible
// and reconcilable, never double-credited. Transactional atomicity + idempotent
// execution is a Phase 1.6 (outbox/ChainTransaction) hardening item.
export class DecideApproval {
  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly executor: ApprovalActionExecutor,
    private readonly clock: Clock,
  ) {}

  async approve(input: { approvalId: string; checkerId: string }): Promise<void> {
    const approval = await this.load(input.approvalId);
    const approved = approval.approve(input.checkerId, this.clock.now());
    await this.approvals.save(approved);
    await this.executor.execute(approved);
  }

  async reject(input: { approvalId: string; checkerId: string; reason: string }): Promise<void> {
    const approval = await this.load(input.approvalId);
    await this.approvals.save(approval.reject(input.checkerId, input.reason, this.clock.now()));
  }

  private async load(approvalId: string): Promise<Approval> {
    const approval = await this.approvals.findById(approvalId);
    if (!approval) {
      throw new ApprovalNotFoundError(approvalId);
    }
    return approval;
  }
}
