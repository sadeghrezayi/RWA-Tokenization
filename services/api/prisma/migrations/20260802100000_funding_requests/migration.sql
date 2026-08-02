-- 2.4 (OD-6): investor-declared bank transfers awaiting treasury confirmation.
-- The reference is unique per tenant: it is the only link between a bank line and a request.
-- CreateTable
CREATE TABLE "funding_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "investor_id" TEXT NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "settled_amount_rial" BIGINT,
    "rejection_reason" TEXT,

    CONSTRAINT "funding_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funding_requests_tenant_id_status_idx" ON "funding_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "funding_requests_tenant_id_investor_id_idx" ON "funding_requests"("tenant_id", "investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "funding_requests_tenant_id_reference_key" ON "funding_requests"("tenant_id", "reference");

-- AddForeignKey
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

