import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { issuerRepositoryContract } from "../contracts/issuer-repository-contract.js";
import { PrismaIssuerRepository } from "../../src/infrastructure/persistence/prisma-issuer-repository.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.issuerMembership.deleteMany();
  await prisma.issuerOrganisation.deleteMany();
  await prisma.$disconnect();
});

issuerRepositoryContract("Prisma/Postgres", async () => {
  await prisma.issuerMembership.deleteMany();
  await prisma.issuerOrganisation.deleteMany();
  return new PrismaIssuerRepository(prisma);
});
