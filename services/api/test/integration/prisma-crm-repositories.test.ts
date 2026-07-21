import { afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  crmNoteRepositoryContract,
  crmProfileRepositoryContract,
  followUpRepositoryContract,
} from "../contracts/crm-repositories-contract.js";
import {
  PrismaCrmNoteRepository,
  PrismaCrmProfileRepository,
  PrismaFollowUpRepository,
} from "../../src/infrastructure/persistence/prisma-crm-repositories.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

crmProfileRepositoryContract("Prisma (real Postgres)", () =>
  Promise.resolve(new PrismaCrmProfileRepository(prisma)),
);
crmNoteRepositoryContract("Prisma (real Postgres)", () =>
  Promise.resolve(new PrismaCrmNoteRepository(prisma)),
);
followUpRepositoryContract("Prisma (real Postgres)", () =>
  Promise.resolve(new PrismaFollowUpRepository(prisma)),
);
