-- CreateEnum
CREATE TYPE "RedemptionState" AS ENUM ('requested', 'fulfilled', 'rejected');

-- CreateTable
CREATE TABLE "token_transfers" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "from_investor_id" TEXT NOT NULL,
    "to_investor_id" TEXT NOT NULL,
    "tokens" BIGINT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "tokens" BIGINT NOT NULL,
    "state" "RedemptionState" NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "payout_rial" BIGINT,
    "rejection_reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_transfers_asset_id_idx" ON "token_transfers"("asset_id");

-- CreateIndex
CREATE INDEX "token_transfers_from_investor_id_idx" ON "token_transfers"("from_investor_id");

-- CreateIndex
CREATE INDEX "token_transfers_to_investor_id_idx" ON "token_transfers"("to_investor_id");

-- CreateIndex
CREATE INDEX "redemptions_investor_id_idx" ON "redemptions"("investor_id");
