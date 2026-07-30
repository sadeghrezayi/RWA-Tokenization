-- 2.1a: deliberate publication to the public catalog, distinct from state.
-- NULL = never published, so every existing offering stays private by default.
-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "published_at" TIMESTAMP(3);
