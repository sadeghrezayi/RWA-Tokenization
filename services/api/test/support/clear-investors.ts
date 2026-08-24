import type { PrismaClient } from "@prisma/client";

// Deleting investors in a test is not one statement, because several tables
// reference them with ON DELETE RESTRICT — deliberately, since a screening, a
// risk rating and a mint record are all audit-grade facts that should not
// vanish because someone removed a row.
//
// Every time a new RESTRICT-ing child is added, every suite that wipes
// investors breaks — and it breaks in the OTHER suites, only in a full run,
// only once something upstream has created a child row. `screening_results`
// cost 25 failures across 6 files; `allocation_mints` cost five CI cycles
// because the failure surfaced in the onchainid suite, which has nothing to do
// with minting.
//
// So: one place. Add the new child HERE and every suite is fixed at once.
export const clearInvestors = async (prisma: PrismaClient): Promise<void> => {
  // Children first, in no particular order among themselves — they only
  // reference the investor, not each other.
  await prisma.allocationMint.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.screeningResult.deleteMany();
  await prisma.onchainIdentity.deleteMany();
  await prisma.investor.deleteMany();
};
