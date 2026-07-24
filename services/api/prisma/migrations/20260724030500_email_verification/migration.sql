-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: accounts that existed before email verification shipped are treated
-- as verified (they registered when no verification step existed). New accounts
-- created after this migration default to false and go through the flow.
UPDATE "investors" SET "email_verified" = true;

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "token_hash" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "email_verification_tokens_investor_id_idx" ON "email_verification_tokens"("investor_id");
