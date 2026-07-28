import type { ApprovalView } from "../approvals/list-approvals.js";
import type { InvestorView } from "../identity/get-investor.js";
import type { RedemptionView } from "../redemptions/get-redemptions.js";

// How many items each section previews. The dashboard is a triage surface, not
// a full listing — the section's own page holds the rest.
const PREVIEW_LIMIT = 5;

export type WorkQueueKey = "kyc" | "approvals" | "redemptions";

export interface WorkQueueItem {
  id: string;
  // What a human needs to recognise the item without opening it.
  label: string;
  // ISO-8601. Absent when the underlying record carries no "waiting since"
  // time — KYC has no submitted-at timestamp today, and inventing one from
  // registration time would misreport how long someone has actually waited.
  waitingSince?: string;
}

export interface WorkQueueSection {
  key: WorkQueueKey;
  // The TRUE outstanding count, independent of the capped preview: a badge that
  // under-reports work is worse than no badge.
  total: number;
  items: WorkQueueItem[];
}

export interface WorkQueueView {
  sections: WorkQueueSection[];
  totalOutstanding: number;
}

// Narrow shapes of the existing read use-cases, so the queue composes them
// rather than re-deriving what "pending" means for each domain.
interface PendingKycSource {
  execute(): Promise<InvestorView[]>;
}
interface PendingApprovalSource {
  pending(): Promise<ApprovalView[]>;
}
interface RedemptionSource {
  executeAll(): Promise<RedemptionView[]>;
}

// 1.8: the ops triage view — everything currently waiting on a human decision,
// oldest first. Deliberately composed from the existing per-domain read models
// so "pending" has ONE definition per domain (DRY).
export class GetWorkQueue {
  constructor(
    private readonly pendingKyc: PendingKycSource,
    private readonly approvals: PendingApprovalSource,
    private readonly redemptions: RedemptionSource,
  ) {}

  async execute(): Promise<WorkQueueView> {
    const [kyc, approvals, redemptions] = await Promise.all([
      this.pendingKyc.execute(),
      this.approvals.pending(),
      this.redemptions.executeAll(),
    ]);

    const sections: WorkQueueSection[] = [
      this.section(
        "kyc",
        kyc.map((investor) => ({
          id: investor.id,
          label: `KYC review for ${investor.email}`,
        })),
      ),
      this.section(
        "approvals",
        approvals.map((approval) => ({
          id: approval.id,
          label: approval.summary,
          waitingSince: approval.createdAt,
        })),
      ),
      this.section(
        "redemptions",
        redemptions
          .filter((redemption) => redemption.state === "requested")
          .map((redemption) => ({
            id: redemption.id,
            label: `Redemption of ${redemption.tokens} tokens`,
            waitingSince: redemption.requestedAt,
          })),
      ),
    ];

    return {
      sections,
      totalOutstanding: sections.reduce((sum, section) => sum + section.total, 0),
    };
  }

  // Oldest first: a work queue is worked from the longest wait down. Items with
  // no known wait time sort last rather than jumping the queue.
  private section(key: WorkQueueKey, items: WorkQueueItem[]): WorkQueueSection {
    const ordered = [...items].sort((a, b) => {
      if (a.waitingSince === undefined) return b.waitingSince === undefined ? 0 : 1;
      if (b.waitingSince === undefined) return -1;
      return a.waitingSince.localeCompare(b.waitingSince);
    });
    return { key, total: ordered.length, items: ordered.slice(0, PREVIEW_LIMIT) };
  }
}
