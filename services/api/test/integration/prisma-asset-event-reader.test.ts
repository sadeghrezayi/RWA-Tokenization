import { afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  PrismaAssetEventLog,
  PrismaAssetEventReader,
} from "../../src/infrastructure/persistence/prisma-asset-repository.js";
import { assetEventReaderContract } from "../contracts/asset-event-reader-contract.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

assetEventReaderContract("Prisma (real Postgres)", () =>
  Promise.resolve({
    log: new PrismaAssetEventLog(prisma),
    reader: new PrismaAssetEventReader(prisma),
  }),
);
