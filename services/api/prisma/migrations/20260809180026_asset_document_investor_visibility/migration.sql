-- 2.5d: disclosure of a dossier document to holders is opt-in. Existing rows
-- default to hidden, which is the safe direction: nothing becomes readable by
-- anyone as a side effect of this migration.
ALTER TABLE "asset_documents" ADD COLUMN "investor_visible" BOOLEAN NOT NULL DEFAULT false;
