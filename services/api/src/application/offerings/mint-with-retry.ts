import { UnresolvedMintError } from "./errors.js";
import type { MintAllocation } from "./mint-allocation.js";
import type { OutboxEnqueue } from "../outbox/ports.js";

export const MINT_ALLOCATION_TYPE = "offering.mint_allocation";

// P0-2 step 2: attempt the mint inline, and hand it to the outbox to retry if
// the chain refuses.
//
// The requirement is "retries until the holder is registered" — a mint that
// fails because the KYC claim has not drained yet must not fail the close,
// which by then has already captured the money (K-34).
//
// INLINE FIRST, rather than enqueue-and-return, per the backlog's own
// acceptance that "the devnet fast path is preserved for tests". The happy path
// stays synchronous, so a close still produces tokens immediately and the
// browser journey is unaffected. Step 1's idempotency is what makes it safe: if
// a queued retry ever races the inline attempt, the second is a no-op rather
// than a double-issue.
export class MintWithRetry {
  constructor(
    private readonly mint: MintAllocation,
    private readonly outbox: OutboxEnqueue,
  ) {}

  async execute(input: {
    offeringId: string;
    tokenAddress: string;
    investorId: string;
    tokens: bigint;
  }): Promise<void> {
    try {
      await this.mint.execute(input);
    } catch (error: unknown) {
      if (error instanceof UnresolvedMintError) {
        // Deliberately NOT queued. An unresolved attempt needs a person to
        // reconcile it — retrying it might double-issue, and five automated
        // attempts followed by a dead letter would bury the one case that
        // actually wants attention.
        throw error;
      }
      await this.outbox.enqueue({
        type: MINT_ALLOCATION_TYPE,
        payload: {
          offeringId: input.offeringId,
          tokenAddress: input.tokenAddress,
          investorId: input.investorId,
          // bigint is not JSON. Carried as a string and converted back by the
          // handler — a token count silently truncated through a float would
          // be worse than the failure being retried.
          tokens: String(input.tokens),
          // So a queued retry is not a mystery to whoever reads the row.
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
