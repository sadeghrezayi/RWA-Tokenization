import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { riskAssessmentRepositoryContract } from "../contracts/risk-assessment-repository-contract.js";
import { PrismaRiskAssessmentRepository } from "../../src/infrastructure/persistence/prisma-risk-assessment-repository.js";

const prisma = new PrismaClient();
let seq = 0;
const ids = { nextId: () => `risk-${String(++seq)}` };

const clear = async (): Promise<void> => {
  // ON DELETE RESTRICT, so assessments clear before their subjects — the same
  // trap the screening suite documents.
  await prisma.riskAssessment.deleteMany();
  await prisma.investor.deleteMany({ where: { email: { endsWith: "@risk.example" } } });
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // Rows left behind here would block every later suite that deletes investors.
  await clear();
  await prisma.$disconnect();
});

const seedSubject = async (id: string): Promise<void> => {
  await prisma.investor.upsert({
    where: { id },
    update: {},
    create: {
      id,
      tenantId: "default",
      email: `${id}@risk.example`,
      passwordHash: "x",
      kycState: "draft",
    },
  });
};

riskAssessmentRepositoryContract(
  "Prisma/Postgres",
  async () => {
    await clear();
    return new PrismaRiskAssessmentRepository(prisma, ids);
  },
  seedSubject,
);
