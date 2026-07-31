-- 2.3e: encrypted onboarding answers (sealed JSON per investor+step).
-- CreateTable
CREATE TABLE "onboarding_answers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "investor_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_answers_tenant_id_investor_id_idx" ON "onboarding_answers"("tenant_id", "investor_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_answers_tenant_id_investor_id_step_key" ON "onboarding_answers"("tenant_id", "investor_id", "step");

-- AddForeignKey
ALTER TABLE "onboarding_answers" ADD CONSTRAINT "onboarding_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

