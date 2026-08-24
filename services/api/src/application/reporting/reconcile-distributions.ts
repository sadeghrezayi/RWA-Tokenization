import type { LedgerCreditReader } from "./ports.js";
import type { DistributionRepository } from "../distributions/ports.js";

export type ReconciliationStatus = "agrees" | "disagrees" | "not_reconcilable";

export interface DistributionReconciliationView {
  distributionId: string;
  assetId: string;
  paidAt?: string;
  declaredRial: string;
  // Absent when the credits cannot be traced at all.
  creditedRial?: string;
  differenceRial?: string;
  status: ReconciliationStatus;
}

// FR-RA-4, the check the platform could not previously make: does the money a
// distribution DECLARED match what actually reached holders' ledgers?
//
// Only PAID distributions are reconciled — a declared one has not moved money,
// so listing it would be noise an auditor has to filter out.
//
// A distribution whose credits predate the ledger `reference` column reports
// NOT RECONCILABLE. Calling it a mismatch would raise a false alarm about a
// payout that was probably fine; calling it agreement would be a lie. The one
// thing an auditor must never be told wrongly is that a figure was checked.
export class ReconcileDistributions {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly credits: LedgerCreditReader,
  ) {}

  async execute(): Promise<DistributionReconciliationView[]> {
    const all = await this.distributions.findAll();
    const paid = all.filter((distribution) => distribution.state === "paid");
    if (paid.length === 0) {
      return [];
    }
    const credited = await this.credits.creditedPerReference();

    const rows = paid.map((distribution) => {
      const traced = credited.get(distribution.id);
      if (traced === undefined) {
        return {
          distributionId: distribution.id,
          assetId: distribution.assetId,
          ...(distribution.paidAt === undefined
            ? {}
            : { paidAt: distribution.paidAt.toISOString() }),
          declaredRial: String(distribution.totalAmountRial),
          status: "not_reconcilable" as const,
        };
      }
      const difference = traced - distribution.totalAmountRial;
      return {
        distributionId: distribution.id,
        assetId: distribution.assetId,
        ...(distribution.paidAt === undefined ? {} : { paidAt: distribution.paidAt.toISOString() }),
        declaredRial: String(distribution.totalAmountRial),
        creditedRial: String(traced),
        differenceRial: String(difference),
        status: (difference === 0n ? "agrees" : "disagrees") as ReconciliationStatus,
      };
    });

    // Disagreements first, then what could not be checked, then the rest: an
    // auditor opens this for the exceptions, and burying them under agreeing
    // rows is how an exception goes unread.
    const rank: Record<ReconciliationStatus, number> = {
      disagrees: 0,
      not_reconcilable: 1,
      agrees: 2,
    };
    return rows.sort((a, b) => rank[a.status] - rank[b.status]);
  }
}
