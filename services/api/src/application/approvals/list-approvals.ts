import type { Approval, ApprovalStatus } from "../../domain/approvals/approval.js";
import type { ApprovalRepository } from "./ports.js";

export interface ApprovalView {
  id: string;
  action: string;
  status: ApprovalStatus;
  summary: string;
  makerId: string;
  checkerId?: string;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
}

// Human-readable one-liner for the queue. ledger.credit is the only action
// today; new actions extend this map.
const SUMMARIZERS: Record<Approval["action"], (a: Approval) => string> = {
  "ledger.credit": (a) =>
    `Credit ${a.payload.amountRial ?? "?"} ریال to investor ${a.payload.investorId ?? "?"}`,
};

const summarize = (approval: Approval): string => SUMMARIZERS[approval.action](approval);

export const toApprovalView = (approval: Approval): ApprovalView => ({
  id: approval.id,
  action: approval.action,
  status: approval.status,
  summary: summarize(approval),
  makerId: approval.makerId,
  createdAt: approval.createdAt.toISOString(),
  ...(approval.checkerId !== undefined ? { checkerId: approval.checkerId } : {}),
  ...(approval.reason !== undefined ? { reason: approval.reason } : {}),
  ...(approval.decidedAt !== undefined ? { decidedAt: approval.decidedAt.toISOString() } : {}),
});

// The maker-checker queue: what is waiting for a second person's decision.
export class ListApprovals {
  constructor(private readonly approvals: ApprovalRepository) {}

  async pending(): Promise<ApprovalView[]> {
    const rows = await this.approvals.findByStatus("pending");
    return rows.map(toApprovalView);
  }
}
