-- 1.7d: records when an overdue follow-up reminder was announced, so the
-- scheduled scan never repeats a reminder. NULL = not yet announced.
-- AlterTable
ALTER TABLE "crm_follow_ups" ADD COLUMN     "due_notified_at" TIMESTAMP(3);
