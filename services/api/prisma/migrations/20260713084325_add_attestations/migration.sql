-- CreateEnum
CREATE TYPE "AttestationKind" AS ENUM ('valuation', 'nav', 'rent', 'reserve');

-- CreateTable
CREATE TABLE "attestations" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" "AttestationKind" NOT NULL,
    "value_rial" BIGINT NOT NULL,
    "attestor_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "document_cid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attestations_asset_id_kind_issued_at_idx" ON "attestations"("asset_id", "kind", "issued_at");
