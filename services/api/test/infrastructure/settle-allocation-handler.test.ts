import { beforeEach, describe, expect, it } from "vitest";
import { SettleAllocationHandler } from "../../src/infrastructure/outbox/settle-allocation-handler.js";
import { MintAllocation } from "../../src/application/offerings/mint-allocation.js";
import { SettleAllocation } from "../../src/application/offerings/settle-allocation.js";
import { MINT_ALLOCATION_TYPE } from "../../src/application/offerings/settle-with-retry.js";
import {
  FakeSettlementRail,
  InMemoryAllocationMintLog,
  RecordingAssetTokenIssuer,
} from "../fakes/offering-fakes.js";

// P0-2 step 2: the queued retry. It calls the SAME idempotent use case the
// inline attempt used, so a redelivery — or a retry racing the original — is a
// no-op rather than a second issuance.
describe("SettleAllocationHandler", () => {
  let issuer: RecordingAssetTokenIssuer;
  let mints: InMemoryAllocationMintLog;
  let rail: FakeSettlementRail;
  let handler: SettleAllocationHandler;

  const PAYLOAD = {
    offeringId: "off-1",
    tokenAddress: "0xToken",
    investorId: "alice",
    tokens: "60",
    costRial: "60000",
  };

  beforeEach(() => {
    issuer = new RecordingAssetTokenIssuer();
    mints = new InMemoryAllocationMintLog();
    rail = new FakeSettlementRail();
    rail.credit("alice", 60_000n);
    handler = new SettleAllocationHandler(
      new SettleAllocation(new MintAllocation(issuer, mints), rail),
    );
  });

  it("registers for the type the producer enqueues", () => {
    expect(handler.type).toBe(MINT_ALLOCATION_TYPE);
  });

  it("mints the allocation the payload names, converting tokens back to bigint", async () => {
    await rail.hold("alice", 60_000n);

    await handler.handle(PAYLOAD);

    expect(issuer.minted).toEqual([{ tokenAddress: "0xToken", investorId: "alice", tokens: 60n }]);
  });

  it("does not re-issue an allocation the inline attempt already minted", async () => {
    // The race this design accepts: the inline attempt succeeded but the close
    // had already queued a retry, or the message was redelivered. Step 1's
    // record is what makes the second one harmless.
    await rail.hold("alice", 60_000n);
    await handler.handle(PAYLOAD);
    issuer.minted.length = 0;

    await handler.handle(PAYLOAD);

    expect(issuer.minted).toEqual([]);
  });

  it("refuses a malformed payload with a message naming the problem", async () => {
    // A bad message must dead-letter with something readable, not throw
    // something opaque from deep inside the chain adapter.
    await expect(handler.handle({ offeringId: "off-1" })).rejects.toThrow(/payload/i);
  });

  it("refuses a token count that is not a whole number", async () => {
    // "60.5" would become 60n through BigInt() only after throwing; anything
    // that silently rounded would issue the wrong number of tokens.
    await expect(handler.handle({ ...PAYLOAD, tokens: "60.5" })).rejects.toThrow(/tokens/i);
    expect(issuer.minted).toEqual([]);
  });

  it("lets a still-failing mint throw, so the outbox retries it", async () => {
    // The whole point: the holder is still not registered. The drainer must
    // see a failure and schedule another attempt with backoff.
    issuer.failNextMint = new Error("investor alice has no on-chain identity");

    await expect(handler.handle(PAYLOAD)).rejects.toThrow(/on-chain identity/);
  });

  it("captures the money the retry settles for", async () => {
    await rail.hold("alice", 60_000n);

    await handler.handle(PAYLOAD);

    expect(rail.captured.get("alice")).toBe(60_000n);
  });

  it("captures nothing when the retried mint still fails", async () => {
    await rail.hold("alice", 60_000n);
    issuer.failNextMint = new Error("investor alice has no on-chain identity");

    await expect(handler.handle(PAYLOAD)).rejects.toThrow();

    expect(rail.captureLog).toEqual([]);
    expect(rail.held.get("alice")).toBe(60_000n);
  });

  it("mints WITHOUT capturing for a message queued before capture moved", async () => {
    // A message already in the outbox when this deployed carries no costRial,
    // and under the order it was written with the money was captured before
    // the mint was attempted. Capturing again here would debit the investor
    // twice, so an absent cost means "already paid", not "free".
    await rail.hold("alice", 60_000n);
    const legacy: Record<string, unknown> = { ...PAYLOAD };
    delete legacy.costRial;

    await handler.handle(legacy);

    expect(issuer.minted).toHaveLength(1);
    expect(rail.captureLog).toEqual([]);
  });

  it("refuses a cost that is not a whole number", async () => {
    await expect(handler.handle({ ...PAYLOAD, costRial: "60000.5" })).rejects.toThrow(/costRial/i);
  });
});
