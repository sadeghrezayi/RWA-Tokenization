-- CreateEnum
CREATE TYPE "DistributionState" AS ENUM ('declared', 'paid');

-- CreateTable
CREATE TABLE "distributions" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "total_amount_rial" BIGINT NOT NULL,
    "state" "DistributionState" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_payouts" (
    "id" BIGSERIAL NOT NULL,
    "distribution_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "tokens" BIGINT NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_payouts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "distribution_payouts" ADD CONSTRAINT "distribution_payouts_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
