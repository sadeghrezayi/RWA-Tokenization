-- Which allocations have had their tokens issued (P0-2 step 1).
--
-- ADDITIVE ONLY: a new table. Nothing existing changes.
--
-- THE UNIQUE INDEX ON (offering_id, investor_id) IS THE IDEMPOTENCY GUARANTEE.
-- Not the application's read-then-write, which two concurrent deliveries can
-- both pass. They race to insert here and exactly one wins; the loser is told
-- so and does not mint.
--
-- `confirmed_at IS NULL` means an attempt was CLAIMED but never confirmed —
-- the chain's answer is unknown. That is deliberately distinguishable from a
-- missing row (never attempted), because the safe response differs: a missing
-- row means mint it, an unconfirmed one means a person must reconcile it
-- before the offering can settle.
--
-- EXISTING OFFERINGS HAVE NO ROWS, and that is correct rather than a gap: they
-- were minted before this record existed. It says "no attempt recorded", which
-- is true. Re-settling one of those would mint again, so do not — they are
-- already closed and closing is one-way.
-- CreateTable
CREATE TABLE "allocation_mints" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "allocation_mints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allocation_mints_tenant_id_idx" ON "allocation_mints"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_mints_offering_id_investor_id_key" ON "allocation_mints"("offering_id", "investor_id");

-- AddForeignKey
ALTER TABLE "allocation_mints" ADD CONSTRAINT "allocation_mints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_mints" ADD CONSTRAINT "allocation_mints_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_mints" ADD CONSTRAINT "allocation_mints_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

