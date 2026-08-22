-- Document review (4.3).
--
-- ADDITIVE ONLY: four nullable/defaulted columns on an existing table. No data
-- is rewritten and nothing existing changes meaning.
--
-- EXISTING ROWS DEFAULT TO 'pending', deliberately. Nobody reviewed those
-- documents — the capability did not exist — and defaulting them to 'accepted'
-- would backdate a human decision that never happened, marking files as read
-- by nobody.
--
-- Consequence to know: an asset still IN STRUCTURING with documents already
-- attached now needs each one reviewed before it can be approved. Assets that
-- were ALREADY approved are unaffected: their dossier is frozen and they cannot
-- be approved again.
-- AlterTable
ALTER TABLE "asset_documents" ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "review_state" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

