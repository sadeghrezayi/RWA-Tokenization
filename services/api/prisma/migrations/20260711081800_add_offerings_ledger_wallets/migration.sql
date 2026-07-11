-- CreateEnum
CREATE TYPE "OfferingState" AS ENUM ('draft', 'open', 'closed_success', 'closed_failed');

-- CreateTable
CREATE TABLE "offerings" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "supply" BIGINT NOT NULL,
    "price_rial" BIGINT NOT NULL,
    "min_per_investor" BIGINT NOT NULL,
    "max_per_investor" BIGINT NOT NULL,
    "minimum_raise" BIGINT NOT NULL,
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "state" "OfferingState" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "tokens" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_allocations" (
    "id" BIGSERIAL NOT NULL,
    "offering_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "requested" BIGINT NOT NULL,
    "allocated" BIGINT NOT NULL,
    "cost_rial" BIGINT NOT NULL,
    "refund_rial" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "investor_id" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "held" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("investor_id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "investor_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "actor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_wallets" (
    "derivation_index" SERIAL NOT NULL,
    "investor_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "investor_wallets_pkey" PRIMARY KEY ("derivation_index")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_wallets_investor_id_key" ON "investor_wallets"("investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_wallets_address_key" ON "investor_wallets"("address");

-- AddForeignKey
ALTER TABLE "offering_subscriptions" ADD CONSTRAINT "offering_subscriptions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_allocations" ADD CONSTRAINT "offering_allocations_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
