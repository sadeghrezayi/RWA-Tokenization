-- 3.3: an asset may be brought by an issuer organisation.
--
-- NULLABLE ON PURPOSE, and NOT backfilled. Every existing asset was onboarded by
-- the platform itself (the 3.1 staff-onboarded model), so NULL is the true
-- answer for them — not a value waiting to be filled in. Choosing an
-- organisation for them would invent an owner and rewrite who is answerable.
--
-- Expand step only (per docs/data-migration-plan.md §2). No constraint is
-- tightened here; whether every FUTURE asset must belong to an organisation is
-- a product decision that has not been taken.
ALTER TABLE "assets" ADD COLUMN "organisation_id" TEXT;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_organisation_id_fkey"
  FOREIGN KEY ("organisation_id") REFERENCES "issuer_organisations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "assets_organisation_id_idx" ON "assets"("organisation_id");
