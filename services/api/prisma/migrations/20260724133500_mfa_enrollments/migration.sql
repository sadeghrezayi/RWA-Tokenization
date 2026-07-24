-- CreateTable
CREATE TABLE "mfa_enrollments" (
    "principal_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recovery_code_hashes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_enrollments_pkey" PRIMARY KEY ("principal_id")
);
