import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { investorRepositoryContract } from "../contracts/investor-repository-contract.js";
import { PrismaInvestorRepository } from "../../src/infrastructure/persistence/prisma-investor-repository.js";
import { clearInvestors } from "../support/clear-investors.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

investorRepositoryContract("Prisma/Postgres", async () => {
  await prisma.onchainIdentity.deleteMany();
  await clearInvestors(prisma);
  return new PrismaInvestorRepository(prisma);
});
