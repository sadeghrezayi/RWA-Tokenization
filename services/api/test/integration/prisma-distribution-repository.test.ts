import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { distributionRepositoryContract } from "../contracts/distribution-repository-contract.js";
import { PrismaDistributionRepository } from "../../src/infrastructure/persistence/prisma-distribution-repository.js";
import { PrismaSettlementRail } from "../../src/infrastructure/settlement/prisma-settlement-rail.js";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

distributionRepositoryContract("Prisma/Postgres", async () => {
  await prisma.distributionPayout.deleteMany();
  await prisma.distribution.deleteMany();
  return new PrismaDistributionRepository(prisma);
});

describe("PrismaSettlementRail.payout (integration)", () => {
  it("credits_the_balance_and_writes_a_distribution_ledger_entry", async () => {
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    const rail = new PrismaSettlementRail(prisma);

    await rail.payout("inv-yd", 67_000n);

    expect(await rail.balanceOf("inv-yd")).toEqual({ balanceRial: 67_000n, heldRial: 0n });
    const entries = await prisma.ledgerEntry.findMany({ where: { investorId: "inv-yd" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "distribution", amountRial: 67_000n });
  });
});
