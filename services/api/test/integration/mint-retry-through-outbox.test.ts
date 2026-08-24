import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";
import { MintAllocation } from "../../src/application/offerings/mint-allocation.js";
import { MintWithRetry } from "../../src/application/offerings/mint-with-retry.js";
import { MintPreconditionError } from "../../src/application/offerings/errors.js";
import { MintAllocationHandler } from "../../src/infrastructure/outbox/mint-allocation-handler.js";
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
  const build = (issuer: RecordingAssetTokenIssuer) => {
    const store = new PrismaOutboxStore(prisma);
    const mint = new MintAllocation(issuer, new PrismaAllocationMintLog(prisma, ids));
    return {
      store,
      mintWithRetry: new MintWithRetry(mint, store),
      drainer: new DrainOutbox(store, [new MintAllocationHandler(mint)], clock),
    };
  };

  it("survives a refusal, queues the work, and mints on the retry", async () => {
    const issuer = new RecordingAssetTokenIssuer();
    const { mintWithRetry, drainer } = build(issuer);

    // The chain refuses: the holder is not registered yet.
    // A precondition failure: nothing reached the chain, so the claim is
    // released and the retry may legitimately try again.
    issuer.failNextMint = new MintPreconditionError("investor has no on-chain identity");
    await expect(
      mintWithRetry.execute({
        offeringId: OFFERING_ID,
        tokenAddress: "0xToken",
        investorId: INVESTOR_ID,
        tokens: 60n,
      }),
    ).resolves.toBeUndefined();

    // Nothing minted yet, but the work is durable.
    expect(issuer.minted).toEqual([]);
    expect(await prisma.outboxMessage.count({ where: { status: "pending" } })).toBe(1);

    // The claim drains, the holder is registered, and the retry lands.
    const summary = await drainer.drain();

    expect(summary.sent).toBe(1);
    expect(issuer.minted).toEqual([
      { tokenAddress: "0xToken", investorId: INVESTOR_ID, tokens: 60n },
    ]);
  });

  it("does not issue twice when the queued retry follows a mint that did succeed", async () => {
    // The race this design accepts: the inline attempt succeeded but a retry
    // was already queued, or the message is redelivered. Step 1's record is
    // what makes the second one harmless — without it this test double-issues.
    const issuer = new RecordingAssetTokenIssuer();
    const { store, mintWithRetry, drainer } = build(issuer);

    await mintWithRetry.execute({
      offeringId: OFFERING_ID,
      tokenAddress: "0xToken",
      investorId: INVESTOR_ID,
      tokens: 60n,
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
  });
});
