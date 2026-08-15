-- CreateTable
CREATE TABLE "issuer_organisations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "organisation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issuer_organisations_tenant_id_idx" ON "issuer_organisations"("tenant_id");

-- CreateIndex
CREATE INDEX "issuer_memberships_tenant_id_idx" ON "issuer_memberships"("tenant_id");

-- CreateIndex
CREATE INDEX "issuer_memberships_user_id_idx" ON "issuer_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "issuer_memberships_organisation_id_user_id_key" ON "issuer_memberships"("organisation_id", "user_id");

-- AddForeignKey
ALTER TABLE "issuer_organisations" ADD CONSTRAINT "issuer_organisations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "issuer_organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

