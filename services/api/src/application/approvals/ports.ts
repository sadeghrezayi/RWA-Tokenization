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

// One authoritative credit path, used both for a direct below-threshold credit
// and by the executor after an above-threshold credit is approved.
export interface LedgerCredit {
  credit(investorId: string, amountRial: bigint, actorId: string): Promise<void>;
}
