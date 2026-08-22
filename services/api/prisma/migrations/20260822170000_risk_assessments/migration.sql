-- Risk assessments (4.2).
--
-- ADDITIVE ONLY: a new table, no change to any existing one, so this cannot
-- disturb data already in the database.
--
-- APPEND-ONLY BY INTENT: a re-rating inserts a new row. Nothing updates or
-- deletes here, because the reasoning behind a rating is what makes it
-- reviewable — and `band` is stored as it was DECIDED rather than recomputed on
-- read, since the thresholds are configuration and will be re-tuned.
--
-- WARNING for anyone writing tests: both foreign keys are ON DELETE RESTRICT,
-- so a leftover assessment BLOCKS deleting its investor. Clear
-- `risk_assessments` before deleting investors in test teardown, exactly as the
-- screening suite has to.
-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "subject_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "assessed_by" TEXT NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_assessments_tenant_id_idx" ON "risk_assessments"("tenant_id");

-- CreateIndex
CREATE INDEX "risk_assessments_subject_id_idx" ON "risk_assessments"("subject_id");

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

