-- What caused a ledger entry (4.4, FR-RA-4).
--
-- ADDITIVE ONLY: one nullable column. Nothing existing changes meaning.
--
-- DELIBERATELY LEFT NULL FOR EXISTING ROWS. A distribution paid before this
-- column existed genuinely cannot be traced to its credits, and backfilling a
-- guess would turn "not traceable" into "traced" — which is the one thing an
-- auditor must never be told wrongly. The reconciliation view reports those
-- distributions as NOT RECONCILABLE rather than as mismatched.
-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "reference" TEXT;

