-- CreateEnum
CREATE TYPE "KycState" AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kyc_state" "KycState" NOT NULL,
    "kyc_rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investors_email_key" ON "investors"("email");
