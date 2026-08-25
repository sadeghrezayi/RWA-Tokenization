import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaAwaitingMintReader } from "../../src/infrastructure/reporting/prisma-awaiting-mint-reader.js";
import { MINT_ALLOCATION_TYPE } from "../../src/application/offerings/settle-with-retry.js";
import { clearInvestors } from "../support/clear-investors.js";

// P0-2 step 3 residue (K-34). The use case's tests use a fake reader, so this
// QUERY — four joins and a composite NOT EXISTS — is only ever real here.
const prisma = new PrismaClient();
const reader = new PrismaAwaitingMintReader(prisma);

const ASSET_ID = "asset-await";
const OFFERING_ID = "off-await";

const seedOffering = async (): Promise<void> => {
  await prisma.asset.create({
    data: {
      id: ASSET_ID,
      tenantId: "default",
      name: "Vanak Tower",
      type: "asset_backed",
      state: "proposed",
    },
  });
  await prisma.offering.create({
    data: {
      id: OFFERING_ID,
      tenantId: "default",
      assetId: ASSET_ID,
      tokenAddress: "0xToken",
      supply: 1_000n,
      priceRial: 1_000n,
      minPerInvestor: 1n,
      maxPerInvestor: 1_000n,
      minimumRaise: 1n,
      state: "closed_success",
      opensAt: new Date("2026-08-01T00:00:00.000Z"),
      closesAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  });
};

const investorWithAllocation = async (
  id: string,
  allocated: bigint,
  costRial: bigint,
): Promise<void> => {
  await prisma.investor.create({
    data: {
      id,
      tenantId: "default",
      email: `${id}@example.com`,
      passwordHash: "x",
      kycState: "approved",
    },
  });
  await prisma.offeringAllocation.create({
    data: {
      tenantId: "default",
      offeringId: OFFERING_ID,
      investorId: id,
      requested: allocated,
      allocated,
      costRial,
      refundRial: 0n,
    },
  });
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.outboxMessage.deleteMany();
  await prisma.allocationMint.deleteMany();
  await prisma.offeringAllocation.deleteMany();
  await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
  await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
  await clearInvestors(prisma);
  await seedOffering();
});

describe("PrismaAwaitingMintReader (integration, real Postgres)", () => {
  it("returns the investor, the asset, the tokens owed and the money held", async () => {
    await investorWithAllocation("inv-1", 60n, 60_000n);

    const rows = await reader.awaitingMint();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      offeringId: OFFERING_ID,
      assetName: "Vanak Tower",
      investorId: "inv-1",
      investorEmail: "inv-1@example.com",
      tokens: 60n,
      heldRial: 60_000n,
      claimedAt: null,
    });
    // `since` is when the ALLOCATION was written — the moment the money began
    // being held. The offering's scheduled close is a different thing and
    // would misreport the wait whenever a close ran late.
    expect(rows[0]?.since).toBeInstanceOf(Date);
  });

  it("excludes an allocation whose mint confirmed", async () => {
    await investorWithAllocation("inv-done", 60n, 60_000n);
    await prisma.allocationMint.create({
      data: {
        id: "am-done",
        tenantId: "default",
        offeringId: OFFERING_ID,
        investorId: "inv-done",
        tokens: "60",
        confirmedAt: new Date(),
      },
    });

    expect(await reader.awaitingMint()).toEqual([]);
  });

  it("reports a claimed-but-unconfirmed mint with its claim time", async () => {
    await investorWithAllocation("inv-unres", 60n, 60_000n);
    const claimedAt = new Date("2026-08-20T09:05:00.000Z");
    await prisma.allocationMint.create({
      data: {
        id: "am-unres",
        tenantId: "default",
        offeringId: OFFERING_ID,
        investorId: "inv-unres",
        tokens: "60",
        claimedAt,
      },
    });

    const rows = await reader.awaitingMint();

    expect(rows[0]?.claimedAt).toEqual(claimedAt);
  });

  it("attaches the queued retry that explains why it is stuck", async () => {
    await investorWithAllocation("inv-retry", 60n, 60_000n);
    await prisma.outboxMessage.create({
      data: {
        id: "ob-1",
        type: MINT_ALLOCATION_TYPE,
        payload: {
          offeringId: OFFERING_ID,
          investorId: "inv-retry",
          tokenAddress: "0xToken",
          tokens: "60",
        },
        status: "failed",
        attempts: 3,
        lastError: "holder not registered",
      },
    });

    const rows = await reader.awaitingMint();

    expect(rows[0]?.retry).toEqual({
      status: "failed",
      attempts: 3,
      lastError: "holder not registered",
    });
  });

  it("does not attach another investor's retry message", async () => {
    // The join is on a JSON payload, which is exactly the kind of thing that
    // silently matches too much. If this ever regresses, one investor's error
    // is shown against another's money.
    await investorWithAllocation("inv-a", 60n, 60_000n);
    await investorWithAllocation("inv-b", 10n, 10_000n);
    await prisma.outboxMessage.create({
      data: {
        id: "ob-a",
        type: MINT_ALLOCATION_TYPE,
        payload: { offeringId: OFFERING_ID, investorId: "inv-a", tokens: "60" },
        status: "failed",
        attempts: 2,
        lastError: "only inv-a",
      },
    });

    const rows = await reader.awaitingMint();
    const byInvestor = new Map(rows.map((r) => [r.investorId, r]));

    expect(byInvestor.get("inv-a")?.retry?.lastError).toBe("only inv-a");
    expect(byInvestor.get("inv-b")?.retry).toBeUndefined();
  });

  it("ignores an allocation that was allocated nothing", async () => {
    await investorWithAllocation("inv-zero", 0n, 0n);

    expect(await reader.awaitingMint()).toEqual([]);
  });
});
