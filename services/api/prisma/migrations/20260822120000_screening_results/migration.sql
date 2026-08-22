-- 4.2: sanctions/PEP screening results.
--
-- Append-only by intent: no unique key on subject_id, because a re-run months
-- later is a NEW fact about a new moment rather than a correction of the old
-- one. Compliance wants the history.
--
-- `provider` and `simulated` sit alongside the outcome deliberately. A result
-- travels — into a report, into a regulator's hands — and must always be able
-- to say what produced it; a row reading "clear" with no idea who checked is a
-- liability rather than a record. Today the only adapter is a labeled mock.
--
-- ON DELETE RESTRICT on subject_id, matching onchain_identities: a screening is
-- evidence, and deleting the person should not silently erase it. Test suites
-- that create screenings must clear them before deleting investors.
-- CreateTable
CREATE TABLE "screening_results" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "subject_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screening_results_tenant_id_idx" ON "screening_results"("tenant_id");

-- CreateIndex
CREATE INDEX "screening_results_subject_id_idx" ON "screening_results"("subject_id");

-- AddForeignKey
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

