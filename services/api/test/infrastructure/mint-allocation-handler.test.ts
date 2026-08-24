import { beforeEach, describe, expect, it } from "vitest";
import { MintAllocationHandler } from "../../src/infrastructure/outbox/mint-allocation-handler.js";
import { MintAllocation } from "../../src/application/offerings/mint-allocation.js";
import { MINT_ALLOCATION_TYPE } from "../../src/application/offerings/mint-with-retry.js";
import { InMemoryAllocationMintLog, RecordingAssetTokenIssuer } from "../fakes/offering-fakes.js";

// P0-2 step 2: the queued retry. It calls the SAME idempotent use case the
// inline attempt used, so a redelivery — or a retry racing the original — is a
// no-op rather than a second issuance.
describe("MintAllocationHandler", () => {
  let issuer: RecordingAssetTokenIssuer;
  let mints: InMemoryAllocationMintLog;
  let handler: MintAllocationHandler;

  const PAYLOAD = {
    offeringId: "off-1",
    tokenAddress: "0xToken",
    investorId: "alice",
    tokens: "60",
  };

  beforeEach(() => {
    issuer = new RecordingAssetTokenIssuer();
    mints = new InMemoryAllocationMintLog();
    handler = new MintAllocationHandler(new MintAllocation(issuer, mints));
  });

  it("registers for the type the producer enqueues", () => {
    expect(handler.type).toBe(MINT_ALLOCATION_TYPE);
  });

  it("mints the allocation the payload names, converting tokens back to bigint", async () => {
    await handler.handle(PAYLOAD);

    expect(issuer.minted).toEqual([{ tokenAddress: "0xToken", investorId: "alice", tokens: 60n }]);
  });

  it("does not re-issue an allocation the inline attempt already minted", async () => {
    // The race this design accepts: the inline attempt succeeded but the close
    // had already queued a retry, or the message was redelivered. Step 1's
    // record is what makes the second one harmless.
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
});
