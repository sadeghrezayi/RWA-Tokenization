import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assetRepositoryContract } from "../contracts/asset-repository-contract.js";
import {
  PrismaAssetEventLog,
  PrismaAssetRepository,
} from "../../src/infrastructure/persistence/prisma-asset-repository.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

assetRepositoryContract("Prisma/Postgres", async () => {
  await prisma.assetEvent.deleteMany();
  await prisma.assetDocument.deleteMany();
  await prisma.asset.deleteMany();
  return new PrismaAssetRepository(prisma);
});

describe("PrismaAssetEventLog", () => {
  it("appends_events_with_actor_and_details", async () => {
    await prisma.asset.create({
      data: { id: "asset-ev", name: "SPV", type: "asset_backed", state: "proposed" },
    });
    const log = new PrismaAssetEventLog(prisma);

    await log.append({
      assetId: "asset-ev",
      event: "asset_proposed",
      actor: "officer-1",
      details: { note: "pilot" },
    });

    const rows = await prisma.assetEvent.findMany({ where: { assetId: "asset-ev" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "asset_proposed", actor: "officer-1" });
  });
});
