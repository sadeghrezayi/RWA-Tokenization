import type { PrismaClient } from "@prisma/client";

// 2.3e: the self-service "submit KYC with nothing attached" endpoint is gone —
// the onboarding wizard is the only way an application reaches a reviewer.
// Suites that merely need an investor sitting in the review queue seed that
// state directly instead of driving five wizard steps they are not testing.
export const seedSubmittedKyc = async (
  prisma: Pick<PrismaClient, "investor">,
  investorId: string,
): Promise<void> => {
  await prisma.investor.updateMany({ where: { id: investorId }, data: { kycState: "submitted" } });
};
