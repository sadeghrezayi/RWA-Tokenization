import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { offeringRepositoryContract } from "../contracts/offering-repository-contract.js";
import { PrismaOfferingRepository } from "../../src/infrastructure/persistence/prisma-offering-repository.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

offeringRepositoryContract("Prisma/Postgres", async () => {
  await prisma.offeringAllocation.deleteMany();
  await prisma.offeringSubscription.deleteMany();
  await prisma.offering.deleteMany();
  return new PrismaOfferingRepository(prisma);
});
