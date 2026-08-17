import type { Approval, ApprovalStatus } from "../../domain/approvals/approval.js";
import type { InvestorRepository, StaffUserRepository } from "../identity/ports.js";
import { groupDigits } from "../shared/format.js";
import type { ApprovalRepository } from "./ports.js";

export interface ApprovalView {
  id: string;
  action: string;
  status: ApprovalStatus;
  summary: string;
  // The account id is what an audit refers to; the label is the person a
  // checker actually reads. Only the maker is named — this view returns PENDING
  // approvals, which by definition nobody has decided yet.
  makerId: string;
  makerLabel?: string;
  checkerId?: string;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
}

// Human-readable one-liner for the queue (P2 human labels): a grouped amount and
// the investor named by email, since a person is deciding about money and a raw
// UUID tells them nothing. `labels` maps investorId → email; an unresolved id
// falls back to itself rather than hiding the row. ledger.credit is the only
// action today; new actions extend this map.
const SUMMARIZERS: Record<
  Approval["action"],
  (a: Approval, labels: ReadonlyMap<string, string>) => string
> = {
  "ledger.credit": (a, labels) => {
    const investorId = a.payload.investorId ?? "?";
    const who = labels.get(investorId) ?? investorId;
    return `Credit ${groupDigits(a.payload.amountRial ?? "?")} ریال to ${who}`;
  },
};

const summarize = (approval: Approval, labels: ReadonlyMap<string, string>): string =>
  SUMMARIZERS[approval.action](approval, labels);

// An unresolved maker has no label at all rather than an empty one — absent
// facts stay absent (exactOptionalPropertyTypes).
const makerLabelOf = (
  staffLabels: ReadonlyMap<string, string>,
  makerId: string,
): { makerLabel?: string } => {
  const label = staffLabels.get(makerId);
  return label === undefined ? {} : { makerLabel: label };
};

export const toApprovalView = (
  approval: Approval,
  labels: ReadonlyMap<string, string> = new Map(),
  staffLabels: ReadonlyMap<string, string> = new Map(),
): ApprovalView => ({
  id: approval.id,
  action: approval.action,
  status: approval.status,
  summary: summarize(approval, labels),
  makerId: approval.makerId,
  ...makerLabelOf(staffLabels, approval.makerId),
  createdAt: approval.createdAt.toISOString(),
  ...(approval.checkerId !== undefined ? { checkerId: approval.checkerId } : {}),
  ...(approval.reason !== undefined ? { reason: approval.reason } : {}),
  ...(approval.decidedAt !== undefined ? { decidedAt: approval.decidedAt.toISOString() } : {}),
});

// The maker-checker queue: what is waiting for a second person's decision.
export class ListApprovals {
  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly investors: InvestorRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async pending(): Promise<ApprovalView[]> {
    const rows = await this.approvals.findByStatus("pending");
    const labels = await this.labelsFor(rows);
    const staffLabels = await this.staffLabelsFor(rows);
    return rows.map((row) => toApprovalView(row, labels, staffLabels));
  }

  // The maker is a colleague, not an account id. One lookup per distinct maker,
  // and an unresolved account keeps its id rather than losing who asked.
  private async staffLabelsFor(rows: readonly Approval[]): Promise<ReadonlyMap<string, string>> {
    const labels = new Map<string, string>();
    for (const id of new Set(rows.map((row) => row.makerId))) {
      const email = (await this.staff.findById(id))?.email.value;
      if (email !== undefined) {
        labels.set(id, email);
      }
    }
    return labels;
  }

  // One lookup per distinct investor in the batch, not per row.
  private async labelsFor(rows: readonly Approval[]): Promise<ReadonlyMap<string, string>> {
    const ids = new Set(
      rows.map((row) => row.payload.investorId).filter((id): id is string => id !== undefined),
    );
    const labels = new Map<string, string>();
    for (const id of ids) {
      const email = (await this.investors.findById(id))?.email.value;
      if (email !== undefined) {
        labels.set(id, email);
      }
    }
    return labels;
  }
}
