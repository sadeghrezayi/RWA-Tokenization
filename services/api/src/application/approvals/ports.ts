import type { Approval, ApprovalStatus } from "../../domain/approvals/approval.js";

export interface ApprovalRepository {
  save(approval: Approval): Promise<void>;
  findById(id: string): Promise<Approval | undefined>;
  findByStatus(status: ApprovalStatus): Promise<Approval[]>;
}

// Performs an approved sensitive action. The adapter dispatches on
// approval.action (ledger.credit today). Given the whole Approval, it can use
// the maker as the acting party for audit.
export interface ApprovalActionExecutor {
  execute(approval: Approval): Promise<void>;
}

// T8 atomicity (1.6): commits an approval decision AND its effect in a single DB
// transaction — the approved-status write and the ledger credit either both
// commit or both roll back (no approved-but-uncredited window, no double-credit
// on retry). The callback receives transaction-bound stores.
export interface ApprovalCommit {
  commit(
    work: (stores: {
      approvals: ApprovalRepository;
      executor: ApprovalActionExecutor;
    }) => Promise<void>,
  ): Promise<void>;
}

// One authoritative credit path, used both for a direct below-threshold credit
// and by the executor after an above-threshold credit is approved.
export interface LedgerCredit {
  credit(investorId: string, amountRial: bigint, actorId: string): Promise<void>;
}

// The approved effect for distribution.pay. Declared here for the same reason
// LedgerCredit is: the executor depends on the capability, not on the use case
// that happens to provide it.
export interface DistributionPayout {
  execute(input: { distributionId: string; actor: string }): Promise<unknown>;
}

// 1.7c: raised when a sensitive action is parked for maker-checker. The
// notifications module implements this to alert the eligible checkers so a
// pending approval is not silently waiting in a queue no one is watching.
export interface ApprovalParkedNotifier {
  approvalParked(approval: Approval): Promise<void>;
}
