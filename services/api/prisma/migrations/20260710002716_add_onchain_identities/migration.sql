-- CreateTable
CREATE TABLE "onchain_identities" (
    "investor_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onchain_identities_pkey" PRIMARY KEY ("investor_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onchain_identities_address_key" ON "onchain_identities"("address");

-- AddForeignKey
ALTER TABLE "onchain_identities" ADD CONSTRAINT "onchain_identities_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
