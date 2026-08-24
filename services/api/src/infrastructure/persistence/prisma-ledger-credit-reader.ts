import type { PrismaClient } from "@prisma/client";
import type { LedgerCreditReader } from "../../application/reporting/ports.js";

// 4.4 / FR-RA-4: what actually reached holders' ledgers, grouped by the
// distribution that caused it.
//
// Grouped in the DATABASE rather than by loading entries: the ledger is
// append-only and grows without bound, and an auditor's page must not get
// slower every time anyone is paid.
//
// Entries with no reference are excluded rather than grouped under a blank
// key — they predate the column, and the reconciliation reports those
// distributions as not reconcilable rather than as having received nothing.
export class PrismaLedgerCreditReader implements LedgerCreditReader {
  constructor(private readonly prisma: PrismaClient) {}

  async creditedPerReference(): Promise<Map<string, bigint>> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["reference"],
      where: { kind: "distribution", reference: { not: null } },
      _sum: { amountRial: true },
    });
    const totals = new Map<string, bigint>();
    for (const row of rows) {
      if (row.reference === null) {
        continue;
      }
      totals.set(row.reference, row._sum.amountRial ?? 0n);
    }
    return totals;
  }
}
