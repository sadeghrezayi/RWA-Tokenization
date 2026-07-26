-- Transactional outbox (1.6b): durable at-least-once side effects. Platform-level
-- (no tenant_id); drained by a background worker with retry/backoff/dead-letter.
-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_messages_status_available_at_idx" ON "outbox_messages"("status", "available_at");
