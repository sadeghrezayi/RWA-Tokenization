import type { SettleAllocation } from "../../application/offerings/settle-allocation.js";
import { MINT_ALLOCATION_TYPE } from "../../application/offerings/settle-with-retry.js";
import type { OutboxHandler } from "../../application/outbox/ports.js";

const requireString = (payload: Record<string, unknown>, field: string): string => {
  const value = payload[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `invalid ${MINT_ALLOCATION_TYPE} payload: "${field}" must be a non-empty string`,
    );
  }
  return value;
};

// Amounts cross the outbox as strings because bigint is not JSON. Validated
// before BigInt sees it: BigInt("60.5") throws a SyntaxError naming nothing
// useful, and anything that rounded would move the wrong number of tokens or
// the wrong amount of money.
const requireWholeNumber = (raw: string, field: string): bigint => {
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `invalid ${MINT_ALLOCATION_TYPE} payload: "${field}" must be a whole number, got "${raw}"`,
    );
  }
  return BigInt(raw);
};

// P0-2 steps 2 and 3: performs a queued settlement retry — mint, then capture.
//
// It calls the SAME idempotent use case the inline attempt used, so a
// redelivery — or a retry racing the original — is a no-op rather than a second
// issuance. A still-failing mint is allowed to throw, which is how the drainer
// knows to schedule another attempt with backoff; that is the "retries until
// the holder is registered" the requirement asks for.
export class SettleAllocationHandler implements OutboxHandler {
  readonly type = MINT_ALLOCATION_TYPE;

  constructor(private readonly settle: SettleAllocation) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    await this.settle.execute({
      offeringId: requireString(payload, "offeringId"),
      tokenAddress: requireString(payload, "tokenAddress"),
      investorId: requireString(payload, "investorId"),
      tokens: requireWholeNumber(requireString(payload, "tokens"), "tokens"),
      costRial: this.costOf(payload),
    });
  }

  // A message enqueued before P0-2 step 3 carries no cost, and was written
  // under the order that captured the money BEFORE attempting the mint. Zero
  // therefore means "already paid", not "free" — capturing here would debit
  // the investor a second time.
  private costOf(payload: Record<string, unknown>): bigint {
    if (payload.costRial === undefined) {
      return 0n;
    }
    return requireWholeNumber(requireString(payload, "costRial"), "costRial");
  }
}
