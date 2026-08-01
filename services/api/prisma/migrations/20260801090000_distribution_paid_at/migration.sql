-- 2.5a: when a distribution was actually paid, so a holder's income statement can be dated.
-- AlterTable
ALTER TABLE "distributions" ADD COLUMN     "paid_at" TIMESTAMP(3);

