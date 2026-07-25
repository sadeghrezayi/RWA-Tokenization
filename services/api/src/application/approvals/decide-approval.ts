import type { Approval } from "../../domain/approvals/approval.js";
import type { Clock } from "../offerings/ports.js";
import { ApprovalNotFoundError } from "./errors.js";
import type { ApprovalCommit, ApprovalRepository } from "./ports.js";

// T1/T3 maker-checker decision. Approve enforces four-eyes (Approval.approve
// throws SelfApprovalError if checker === maker) and then commits the decision
// and its effect ATOMICALLY (T8): the approved-status write and the ledger
// credit share one DB transaction (1.6a), so they either both land or both roll
// back — no approved-but-uncredited window, no double-credit on retry.
export class DecideApproval {
  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly commit: ApprovalCommit,
    private readonly clock: Clock,
  ) {}

  async approve(input: { approvalId: string; checkerId: string }): Promise<void> {
    const approval = await this.load(input.approvalId);
    // Four-eyes guard runs first (cheap, no I/O); the effect then commits atomically.
    const approved = approval.approve(input.checkerId, this.clock.now());
    await this.commit.commit(async ({ approvals, executor }) => {
      await approvals.save(approved);
      await executor.execute(approved);
    });
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
