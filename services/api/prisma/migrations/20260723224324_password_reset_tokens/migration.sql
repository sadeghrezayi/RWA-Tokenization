-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "token_hash" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "password_reset_tokens_investor_id_idx" ON "password_reset_tokens"("investor_id");

