import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { transferRepositoryContract } from "../contracts/transfer-repository-contract.js";
import { redemptionRepositoryContract } from "../contracts/redemption-repository-contract.js";
import { PrismaTransferRepository } from "../../src/infrastructure/persistence/prisma-transfer-repository.js";
import { PrismaRedemptionRepository } from "../../src/infrastructure/persistence/prisma-redemption-repository.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

transferRepositoryContract("Prisma/Postgres", async () => {
  await prisma.tokenTransfer.deleteMany();
  return new PrismaTransferRepository(prisma);
});

redemptionRepositoryContract("Prisma/Postgres", async () => {
  await prisma.redemption.deleteMany();
  return new PrismaRedemptionRepository(prisma);
});
