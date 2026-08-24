import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { allocationMintLogContract } from "../contracts/allocation-mint-log-contract.js";
import { PrismaAllocationMintLog } from "../../src/infrastructure/persistence/prisma-allocation-mint-log.js";

const prisma = new PrismaClient();
let seq = 0;
const ids = { nextId: () => `mint-${String(++seq)}` };

const OFFERING_IDS = ["off-1", "off-2", "off-3", "off-4", "off-x"];

const clear = async (): Promise<void> => {
  await prisma.allocationMint.deleteMany();
  await prisma.offering.deleteMany({ where: { id: { in: OFFERING_IDS } } });
  await prisma.investor.deleteMany({ where: { email: { endsWith: "@mintlog.example" } } });
  await prisma.asset.deleteMany({ where: { id: "asset-mintlog" } });
};

beforeAll(async () => {
  await prisma.$connect();
  await clear();
});

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

// Both foreign keys are real, so the rows they point at have to exist.
const seed = async (key: { offeringId: string; investorId: string }): Promise<void> => {
  await prisma.asset.upsert({
    where: { id: "asset-mintlog" },
    update: {},
    create: {
      id: "asset-mintlog",
      tenantId: "default",
      name: "Mint Log Asset",
      type: "asset_backed",
      state: "proposed",
    },
  });
  await prisma.offering.upsert({
    where: { id: key.offeringId },
    update: {},
    create: {
      id: key.offeringId,
      tenantId: "default",
      assetId: "asset-mintlog",
      tokenAddress: "0xToken",
      supply: 100n,
      priceRial: 1000n,
      minPerInvestor: 1n,
      maxPerInvestor: 100n,
      minimumRaise: 1n,
      state: "open",
      opensAt: new Date("2026-08-01T00:00:00.000Z"),
      closesAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  });
  await prisma.investor.upsert({
    where: { id: key.investorId },
    update: {},
    create: {
      id: key.investorId,
      tenantId: "default",
      email: `${key.investorId}@mintlog.example`,
      passwordHash: "x",
      kycState: "approved",
    },
  });
};

allocationMintLogContract(
  "Prisma/Postgres",
  async () => {
    await prisma.allocationMint.deleteMany();
    return new PrismaAllocationMintLog(prisma, ids);
  },
  seed,
);

// The guarantee that only the real database can demonstrate. The in-memory fake
// is single-threaded, so its "exactly one claim wins" is true by construction —
// here it has to be true because of the unique index.
describe("PrismaAllocationMintLog under concurrency", () => {
  it("lets exactly one of several SIMULTANEOUS claims win", async () => {
    await prisma.allocationMint.deleteMany();
    const key = { offeringId: "off-1", investorId: "alice" };
    await seed(key);
    const log = new PrismaAllocationMintLog(prisma, ids);

    // Fired together, not in sequence: this is the redelivery race that a
    // read-then-write in application code cannot survive on its own.
    const results = await Promise.all([
      log.claim(key, 60n),
      log.claim(key, 60n),
      log.claim(key, 60n),
      log.claim(key, 60n),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.allocationMint.count({ where: key })).toBe(1);
  });
});
