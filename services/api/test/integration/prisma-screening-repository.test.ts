import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { screeningRepositoryContract } from "../contracts/screening-repository-contract.js";
import { PrismaScreeningRepository } from "../../src/infrastructure/persistence/prisma-screening-repository.js";

const prisma = new PrismaClient();
let seq = 0;
const ids = { nextId: () => `scr-${String(++seq)}` };

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // Screenings are ON DELETE RESTRICT, so rows left behind here block EVERY
  // later suite that deletes investors — 25 failures across 6 files when this
  // was missing. Clearing at the start of each case is not enough: the last
  // case's rows outlive the file.
  await prisma.screeningResult.deleteMany();
  await prisma.investor.deleteMany({ where: { email: { endsWith: "@screening.example" } } });
  await prisma.$disconnect();
});

// The subject is a real foreign key, so the contract seeds an investor first.
const seedSubject = async (id: string): Promise<void> => {
  await prisma.investor.upsert({
    where: { id },
    update: {},
    create: {
      id,
      tenantId: "default",
      email: `${id}@screening.example`,
      passwordHash: "x",
      kycState: "draft",
    },
  });
};

screeningRepositoryContract(
  "Prisma/Postgres",
  async () => {
    // Screenings are ON DELETE RESTRICT, so they clear before their subjects.
    await prisma.screeningResult.deleteMany();
    await prisma.investor.deleteMany({ where: { email: { endsWith: "@screening.example" } } });
    return new PrismaScreeningRepository(prisma, ids);
  },
  seedSubject,
);
