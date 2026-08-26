import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";
import { MintAllocation } from "../../src/application/offerings/mint-allocation.js";
import { SettleAllocation } from "../../src/application/offerings/settle-allocation.js";
import { MINT_ALLOCATION_TYPE } from "../../src/application/offerings/settle-with-retry.js";
import { SettleAllocationHandler } from "../../src/infrastructure/outbox/settle-allocation-handler.js";
import { PrismaAllocationMintLog } from "../../src/infrastructure/persistence/prisma-allocation-mint-log.js";
import { PrismaOutboxStore } from "../../src/infrastructure/persistence/prisma-outbox-store.js";
import { PrismaSettlementRail } from "../../src/infrastructure/settlement/prisma-settlement-rail.js";
import { RecordingAssetTokenIssuer } from "../fakes/offering-fakes.js";

// The backlog's "multi-node outbox draining is untested", now that what drains
// through the outbox is MONEY (P0-2 step 3).
//
// `prisma-outbox-store.test.ts` already proves two workers never CLAIM the same
// row. This is the level above: two full drainers, real handlers, real ledger —
// the property an operator actually cares about is not "the row was claimed
// once" but "the investor was charged once and holds one allocation's tokens".
//
// Those are different claims. A correct claim with a handler that ran twice
// still double-issues, and nothing at the store level would notice.
const prisma = new PrismaClient();
let seq = 0;
const ids = { nextId: () => `cd-${String(++seq)}` };
// Real time: `available_at` defaults to the DATABASE's now(), so a fixed clock
// in the past makes every message look not-yet-due and the drain claims nothing.
const clock = { now: () => new Date() };

const ASSET_ID = "asset-concurrent";
const OFFERING_ID = "off-concurrent";
const INVESTOR_ID = "inv-concurrent";
const COST = 60_000n;

const clear = async (): Promise<void> => {
  await prisma.outboxMessage.deleteMany();
  await prisma.allocationMint.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany();
  await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
  await prisma.investor.deleteMany({ where: { id: INVESTOR_ID } });
  await prisma.asset.deleteMany({ where: { id: ASSET_ID } });
};

beforeAll(async () => {
  await prisma.$connect();
  await clear();
});

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await clear();
  await prisma.asset.create({
    data: {
      id: ASSET_ID,
      tenantId: "default",
      name: "Concurrent Asset",
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
      supply: 100n,
      priceRial: 1_000n,
      minPerInvestor: 1n,
      maxPerInvestor: 100n,
      minimumRaise: 1n,
      state: "closed_success",
      opensAt: new Date("2026-08-01T00:00:00.000Z"),
      closesAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  });
  await prisma.investor.create({
    data: {
      id: INVESTOR_ID,
      tenantId: "default",
      email: "concurrent@example.com",
      passwordHash: "x",
      kycState: "approved",
    },
  });
});

describe("two drainers settling the same allocation (integration, real Postgres)", () => {
  // Each "node" gets its own store, handler and use-case instances, as separate
  // processes would. They share the database, which is the only thing that can
  // actually arbitrate between them.
  const node = (issuer: RecordingAssetTokenIssuer) => {
    const store = new PrismaOutboxStore(prisma);
    const settle = new SettleAllocation(
      new MintAllocation(issuer, new PrismaAllocationMintLog(prisma, ids)),
      new PrismaSettlementRail(prisma),
    );
    return new DrainOutbox(store, [new SettleAllocationHandler(settle)], clock);
  };

  const queueSettlement = async (): Promise<void> => {
    await new PrismaOutboxStore(prisma).enqueue({
      type: MINT_ALLOCATION_TYPE,
      payload: {
        offeringId: OFFERING_ID,
        tokenAddress: "0xToken",
        investorId: INVESTOR_ID,
        tokens: "60",
        costRial: String(COST),
      },
    });
  };

  const fundEscrow = async (): Promise<void> => {
    const rail = new PrismaSettlementRail(prisma);
    await rail.credit(INVESTOR_ID, COST, "officer-1");
    await rail.hold(INVESTOR_ID, COST);
  };

  it("charges the investor once and issues the tokens once", async () => {
    // The shared issuer stands in for the chain: both nodes talk to the same
    // one, so a second mint would be visible here even if the ledger somehow
    // stayed correct.
    const issuer = new RecordingAssetTokenIssuer();
    await fundEscrow();
    await queueSettlement();

    await Promise.all([node(issuer).drain(), node(issuer).drain()]);

    expect(issuer.minted).toEqual([
      { tokenAddress: "0xToken", investorId: INVESTOR_ID, tokens: 60n },
    ]);
    expect(await prisma.allocationMint.count({ where: { offeringId: OFFERING_ID } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
    // The number a holder would complain about: charged once, nothing left held.
    expect(await new PrismaSettlementRail(prisma).balanceOf(INVESTOR_ID)).toEqual({
      balanceRial: 0n,
      heldRial: 0n,
    });
  });

  it("survives the same settlement being queued twice and drained by both", async () => {
    // At-least-once delivery is the outbox's contract, so duplicates are normal
    // rather than exceptional — a redelivery after the visibility window, or a
    // producer that enqueued twice. The effect still has to be exactly once.
    const issuer = new RecordingAssetTokenIssuer();
    await fundEscrow();
    await queueSettlement();
    await queueSettlement();

    await Promise.all([node(issuer).drain(), node(issuer).drain()]);

    expect(issuer.minted).toHaveLength(1);
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
    expect(await new PrismaSettlementRail(prisma).balanceOf(INVESTOR_ID)).toEqual({
      balanceRial: 0n,
      heldRial: 0n,
    });
  });

  it("leaves the money held when both nodes are refused by the chain", async () => {
    // Neither node may take the money for tokens that do not exist, and the
    // work must remain queued rather than being quietly consumed.
    const issuer = new RecordingAssetTokenIssuer();
    issuer.failEveryMint = new Error("holder not registered");
    await fundEscrow();
    await queueSettlement();

    await Promise.all([node(issuer).drain(), node(issuer).drain()]);

    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(0);
    expect(await new PrismaSettlementRail(prisma).balanceOf(INVESTOR_ID)).toEqual({
      balanceRial: 0n,
      heldRial: COST,
    });
    expect(await prisma.outboxMessage.count({ where: { status: "pending" } })).toBe(1);
  });

  it("a duplicate capture cannot reach into another offering's escrow", async () => {
    // Found by mutation-checking the tests above: they pass even with the
    // capture's idempotency key removed, because by then the investor's escrow
    // is empty and a second capture fails on insufficient held funds. That is a
    // real second line of defence, but it is NOT the guarantee — an investor
    // who is also mid-subscription in another offering has escrow left, and a
    // duplicate capture takes THAT instead. Observed directly: with the key
    // removed, the redelivery below writes a second capture and drains the
    // other offering's 60,000 to zero.
    //
    // Sequential and deterministic on purpose. Two concurrent drains do not
    // reliably reproduce it — whichever loses the claim race can be refused
    // before it reaches the capture — and a test for a money guarantee must
    // not depend on winning a race to notice.
    const issuer = new RecordingAssetTokenIssuer();
    const rail = new PrismaSettlementRail(prisma);
    await rail.credit(INVESTOR_ID, 200_000n, "officer-1");
    // 60,000 held for this offering, another 60,000 for a different one.
    await rail.hold(INVESTOR_ID, COST * 2n);

    await queueSettlement();
    await node(issuer).drain();
    // Redelivered AFTER the allocation is complete: the mint is a no-op and the
    // capture is attempted again with money still available to take.
    await queueSettlement();
    await node(issuer).drain();

    expect(issuer.minted).toHaveLength(1);
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
    // The other offering's escrow is untouched. This is the assertion that
    // actually exercises the reference guard.
    expect(await rail.balanceOf(INVESTOR_ID)).toEqual({
      balanceRial: 80_000n,
      heldRial: COST,
    });
  });
});
