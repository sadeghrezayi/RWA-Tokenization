-- 2.3a/2.3b: onboarding applications + KYC evidence.
--
-- kyc_evidence.content holds AES-256-GCM SEALED bytes only. Identity documents
-- are personal data, so they are deliberately NOT stored on IPFS: a private
-- table can be erased, a content-addressed network cannot.
-- CreateTable
CREATE TABLE "onboarding_applications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "investor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completed_steps" TEXT[],
    "change_requests" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "onboarding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_evidence" (
    "reference" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "investor_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_evidence_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_applications_investor_id_key" ON "onboarding_applications"("investor_id");

-- CreateIndex
CREATE INDEX "onboarding_applications_tenant_id_status_idx" ON "onboarding_applications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "kyc_evidence_tenant_id_investor_id_idx" ON "kyc_evidence"("tenant_id", "investor_id");

-- AddForeignKey
ALTER TABLE "onboarding_applications" ADD CONSTRAINT "onboarding_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_evidence" ADD CONSTRAINT "kyc_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

