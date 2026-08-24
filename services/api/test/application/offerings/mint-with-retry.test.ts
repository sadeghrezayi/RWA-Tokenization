import { beforeEach, describe, expect, it } from "vitest";
import {
  MINT_ALLOCATION_TYPE,
  MintWithRetry,
} from "../../../src/application/offerings/mint-with-retry.js";
import { MintAllocation } from "../../../src/application/offerings/mint-allocation.js";
import { UnresolvedMintError } from "../../../src/application/offerings/errors.js";
import {
  InMemoryAllocationMintLog,
  RecordingAssetTokenIssuer,
} from "../../fakes/offering-fakes.js";
import type { NewOutboxMessage, OutboxEnqueue } from "../../../src/application/outbox/ports.js";

class RecordingOutbox implements OutboxEnqueue {
  readonly enqueued: NewOutboxMessage[] = [];
  enqueue(message: NewOutboxMessage): Promise<void> {
    this.enqueued.push(message);
    return Promise.resolve();
  }
}

// P0-2 step 2. The mint is attempted inline and, if the chain refuses, handed
// to the outbox to retry until it succeeds — which is what the requirement
// asks for ("retries until the holder is registered").
//
// Inline-first rather than enqueue-and-return, per the backlog's own
// acceptance that "the devnet fast path is preserved for tests": the happy
// path stays synchronous, so closing an offering still produces tokens
// immediately and the browser journey is unaffected. Step 1's idempotency is
// what makes this safe — if a retry ever races the inline attempt, the second
// one is a no-op rather than a double-issue.
describe("MintWithRetry", () => {
  let issuer: RecordingAssetTokenIssuer;
  let mints: InMemoryAllocationMintLog;
  let outbox: RecordingOutbox;
  let mint: MintWithRetry;

  const ALLOCATION = {
    offeringId: "off-1",
    tokenAddress: "0xToken",
    investorId: "alice",
    tokens: 60n,
  };

  beforeEach(() => {
    issuer = new RecordingAssetTokenIssuer();
    mints = new InMemoryAllocationMintLog();
    outbox = new RecordingOutbox();
    mint = new MintWithRetry(new MintAllocation(issuer, mints), outbox);
  });

  it("mints inline when the chain accepts, and queues nothing", async () => {
    await mint.execute(ALLOCATION);

    expect(issuer.minted).toHaveLength(1);
    expect(outbox.enqueued).toEqual([]);
  });

  it("queues a retry when the chain refuses, WITHOUT failing the close", async () => {
    // The failure this step exists for: the holder's KYC claim has not drained
    // yet, so the token contract rejects the mint. Before, that failed the
    // whole close after the money had already been captured (K-34).
    issuer.failNextMint = new Error("investor alice has no on-chain identity");

    await expect(mint.execute(ALLOCATION)).resolves.toBeUndefined();

    expect(outbox.enqueued).toHaveLength(1);
    expect(outbox.enqueued[0]?.type).toBe(MINT_ALLOCATION_TYPE);
    expect(outbox.enqueued[0]?.payload).toMatchObject({
      offeringId: "off-1",
      tokenAddress: "0xToken",
      investorId: "alice",
      // bigint is not JSON, so the payload carries a string and the handler
      // converts back — a silently truncated token count would be a disaster.
      tokens: "60",
    });
  });

  it("does NOT queue an unresolved mint, and lets it surface", async () => {
    // An unresolved attempt needs a person to reconcile it, not a machine to
    // try again — retrying might double-issue. Queueing it would spend five
    // attempts and dead-letter, burying the one case that wants attention.
    await mints.claim({ offeringId: "off-1", investorId: "alice" }, 60n);

    await expect(mint.execute(ALLOCATION)).rejects.toThrow(UnresolvedMintError);
    expect(outbox.enqueued).toEqual([]);
  });

  it("records the failure that caused the retry, so it is not a mystery", async () => {
    issuer.failNextMint = new Error("chain refused: holder not registered");

    await mint.execute(ALLOCATION);

    expect(String(outbox.enqueued[0]?.payload.reason)).toMatch(/holder not registered/);
  });
});
