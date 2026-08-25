import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";
import { MintAllocation } from "../../src/application/offerings/mint-allocation.js";
import { SettleAllocation } from "../../src/application/offerings/settle-allocation.js";
import { PrismaSettlementRail } from "../../src/infrastructure/settlement/prisma-settlement-rail.js";
import { SettleWithRetry } from "../../src/application/offerings/settle-with-retry.js";
import { MintPreconditionError } from "../../src/application/offerings/errors.js";
import { SettleAllocationHandler } from "../../src/infrastructure/outbox/settle-allocation-handler.js";
import { PrismaAllocationMintLog } from "../../src/infrastructure/persistence/prisma-allocation-mint-log.js";
import { PrismaOutboxStore } from "../../src/infrastructure/persistence/prisma-outbox-store.js";
import { RecordingAssetTokenIssuer } from "../fakes/offering-fakes.js";

const prisma = new PrismaClient();
let seq = 0;
const ids = { nextId: () => `mr-${String(++seq)}` };
// Real time, deliberately. `available_at` defaults to the DATABASE's now(),
// so a fixed clock in the past makes every message look not-yet-due and the
// drain claims nothing — which is what a frozen 12:00 did here. Nothing in
// this test depends on controlling time; it is about the retry mechanism.
const clock = { now: () => new Date() };

const OFFERING_ID = "off-retry";
const INVESTOR_ID = "inv-retry";

const clear = async (): Promise<void> => {
  await prisma.outboxMessage.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany();
  await prisma.allocationMint.deleteMany();
  await prisma.offering.deleteMany({ where: { id: OFFERING_ID } });
  await prisma.investor.deleteMany({ where: { id: INVESTOR_ID } });
  await prisma.asset.deleteMany({ where: { id: "asset-retry" } });
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
      id: "asset-retry",
      tenantId: "default",
      name: "Retry Asset",
      type: "asset_backed",
      state: "proposed",
    },
  });
  await prisma.offering.create({
    data: {
      id: OFFERING_ID,
      tenantId: "default",
      assetId: "asset-retry",
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
  await prisma.investor.create({
    data: {
      id: INVESTOR_ID,
      tenantId: "default",
      email: "retry@mintretry.example",
      passwordHash: "x",
      kycState: "approved",
    },
  });
});

// P0-2 step 2, proven through the real outbox and drainer rather than fakes.
//
// The scenario the requirement names: the mint fails because the holder's KYC
// claim has not drained yet. The close must not fail, and the mint must be
// retried until it succeeds.
describe("a refused mint is retried through the outbox (integration, real Postgres)", () => {
  // The real Rial ledger, not a fake: step 3's exactly-once capture is enforced
  // by a unique index, so proving it needs the database that holds the index.
  const rail = new PrismaSettlementRail(prisma);

  const build = (issuer: RecordingAssetTokenIssuer) => {
    const store = new PrismaOutboxStore(prisma);
    const mint = new MintAllocation(issuer, new PrismaAllocationMintLog(prisma, ids));
    const settle = new SettleAllocation(mint, rail);
    return {
      store,
      settleWithRetry: new SettleWithRetry(settle, store),
      drainer: new DrainOutbox(store, [new SettleAllocationHandler(settle)], clock),
    };
  };

  const fundedEscrow = async (): Promise<void> => {
    await rail.credit(INVESTOR_ID, 60_000n, "officer-1");
    await rail.hold(INVESTOR_ID, 60_000n);
  };

  it("survives a refusal, queues the work, and mints on the retry", async () => {
    const issuer = new RecordingAssetTokenIssuer();
    const { settleWithRetry, drainer } = build(issuer);
    await fundedEscrow();

    // The chain refuses: the holder is not registered yet.
    // A precondition failure: nothing reached the chain, so the claim is
    // released and the retry may legitimately try again.
    issuer.failNextMint = new MintPreconditionError("investor has no on-chain identity");
    await expect(
      settleWithRetry.execute({
        offeringId: OFFERING_ID,
        tokenAddress: "0xToken",
        investorId: INVESTOR_ID,
        tokens: 60n,
        costRial: 60_000n,
      }),
    ).resolves.toBeUndefined();

    // Nothing minted yet, but the work is durable.
    expect(issuer.minted).toEqual([]);
    expect(await prisma.outboxMessage.count({ where: { status: "pending" } })).toBe(1);
    // K-34: the tokens do not exist, so the money has NOT been taken. It is
    // still the investor's, still in escrow, still releasable by a person.
    expect(await rail.balanceOf(INVESTOR_ID)).toEqual({ balanceRial: 0n, heldRial: 60_000n });

    // The claim drains, the holder is registered, and the retry lands.
    const summary = await drainer.drain();

    expect(summary.sent).toBe(1);
    expect(issuer.minted).toEqual([
      { tokenAddress: "0xToken", investorId: INVESTOR_ID, tokens: 60n },
    ]);
    // And only NOW is the money taken — the retry settles both halves.
    expect(await rail.balanceOf(INVESTOR_ID)).toEqual({ balanceRial: 0n, heldRial: 0n });
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
  });

  it("does not issue twice when the queued retry follows a mint that did succeed", async () => {
    // The race this design accepts: the inline attempt succeeded but a retry
    // was already queued, or the message is redelivered. Step 1's record is
    // what makes the second one harmless — without it this test double-issues.
    const issuer = new RecordingAssetTokenIssuer();
    const { store, settleWithRetry, drainer } = build(issuer);
    await fundedEscrow();

    await settleWithRetry.execute({
      offeringId: OFFERING_ID,
      tokenAddress: "0xToken",
      investorId: INVESTOR_ID,
      tokens: 60n,
      costRial: 60_000n,
    });
    expect(issuer.minted).toHaveLength(1);

    // Queue a retry for work that is already done.
    await store.enqueue({
      type: "offering.mint_allocation",
      payload: {
        offeringId: OFFERING_ID,
        tokenAddress: "0xToken",
        investorId: INVESTOR_ID,
        tokens: "60",
      },
    });
    issuer.minted.length = 0;

    await drainer.drain();

    expect(issuer.minted).toEqual([]);
    expect(await prisma.allocationMint.count({ where: { offeringId: OFFERING_ID } })).toBe(1);
    // The other half of the same guarantee: the redelivery must not debit the
    // investor a second time. The unique index on the ledger is what stops it.
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
    expect(await rail.balanceOf(INVESTOR_ID)).toEqual({ balanceRial: 0n, heldRial: 0n });
  });
});
