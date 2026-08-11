-- 3.1: the property a real-estate token is issued against, and what the token
-- conveys. Every column is nullable and the rights table starts empty: an
-- existing asset has not had these recorded, which is a different statement
-- from "this asset conveys nothing", and the domain reads it that way.

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "area_square_metres" INTEGER,
ADD COLUMN     "built_in_year" INTEGER,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "property_type" TEXT,
ADD COLUMN     "title_reference" TEXT;

-- CreateTable
CREATE TABLE "asset_rights" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "asset_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_rights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_rights_tenant_id_idx" ON "asset_rights"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_rights_asset_id_kind_key" ON "asset_rights"("asset_id", "kind");

-- AddForeignKey
ALTER TABLE "asset_rights" ADD CONSTRAINT "asset_rights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_rights" ADD CONSTRAINT "asset_rights_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

