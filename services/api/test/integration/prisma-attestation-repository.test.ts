import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { attestationRepositoryContract } from "../contracts/attestation-repository-contract.js";
import { PrismaAttestationRepository } from "../../src/infrastructure/persistence/prisma-attestation-repository.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

attestationRepositoryContract("Prisma/Postgres", async () => {
  await prisma.attestation.deleteMany();
  return new PrismaAttestationRepository(prisma);
});
