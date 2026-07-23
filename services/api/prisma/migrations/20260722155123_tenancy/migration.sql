-- DropIndex
DROP INDEX "investors_email_key";

-- AlterTable
ALTER TABLE "asset_documents" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "asset_events" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "attestations" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "crm_follow_ups" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "crm_notes" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "crm_profiles" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "distribution_payouts" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "distributions" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "investor_wallets" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "offering_allocations" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "offering_subscriptions" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "onchain_identities" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "token_transfers" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Seed (OD-1a): the single-tenant install's default tenant + the platform
-- operator organization. Must precede the tenant FK constraints below, which
-- validate the backfilled tenant_id='default' on every existing row.
INSERT INTO "tenants" ("id", "name") VALUES ('default', 'Default Tenant');
INSERT INTO "organizations" ("id", "tenant_id", "name", "type", "updated_at")
VALUES ('platform', 'default', 'Platform Operator', 'platform', CURRENT_TIMESTAMP);

-- CreateIndex
CREATE INDEX "organizations_tenant_id_idx" ON "organizations"("tenant_id");

-- CreateIndex
CREATE INDEX "asset_documents_tenant_id_idx" ON "asset_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "asset_events_tenant_id_idx" ON "asset_events"("tenant_id");

-- CreateIndex
CREATE INDEX "assets_tenant_id_idx" ON "assets"("tenant_id");

-- CreateIndex
CREATE INDEX "attestations_tenant_id_idx" ON "attestations"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_follow_ups_tenant_id_idx" ON "crm_follow_ups"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_notes_tenant_id_idx" ON "crm_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_profiles_tenant_id_idx" ON "crm_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "distribution_payouts_tenant_id_idx" ON "distribution_payouts"("tenant_id");

-- CreateIndex
CREATE INDEX "distributions_tenant_id_idx" ON "distributions"("tenant_id");

-- CreateIndex
CREATE INDEX "investor_wallets_tenant_id_idx" ON "investor_wallets"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "investors_tenant_id_email_key" ON "investors"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "ledger_accounts_tenant_id_idx" ON "ledger_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_idx" ON "ledger_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "offering_allocations_tenant_id_idx" ON "offering_allocations"("tenant_id");

-- CreateIndex
CREATE INDEX "offering_subscriptions_tenant_id_idx" ON "offering_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "offerings_tenant_id_idx" ON "offerings"("tenant_id");

-- CreateIndex
CREATE INDEX "onchain_identities_tenant_id_idx" ON "onchain_identities"("tenant_id");

-- CreateIndex
CREATE INDEX "redemptions_tenant_id_idx" ON "redemptions"("tenant_id");

-- CreateIndex
CREATE INDEX "token_transfers_tenant_id_idx" ON "token_transfers"("tenant_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_subscriptions" ADD CONSTRAINT "offering_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_allocations" ADD CONSTRAINT "offering_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_wallets" ADD CONSTRAINT "investor_wallets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onchain_identities" ADD CONSTRAINT "onchain_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_profiles" ADD CONSTRAINT "crm_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

