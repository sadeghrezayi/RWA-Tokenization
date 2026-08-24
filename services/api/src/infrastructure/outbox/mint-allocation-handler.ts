import type { MintAllocation } from "../../application/offerings/mint-allocation.js";
import { MINT_ALLOCATION_TYPE } from "../../application/offerings/mint-with-retry.js";
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

// P0-2 step 2: performs a queued mint retry.
//
// It calls the SAME idempotent use case the inline attempt used, so a
// redelivery — or a retry racing the original — is a no-op rather than a second
// issuance. A still-failing mint is allowed to throw, which is how the drainer
// knows to schedule another attempt with backoff; that is the "retries until
// the holder is registered" the requirement asks for.
export class MintAllocationHandler implements OutboxHandler {
  readonly type = MINT_ALLOCATION_TYPE;

  constructor(private readonly mint: MintAllocation) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const raw = requireString(payload, "tokens");
    // Validated before BigInt sees it: BigInt("60.5") throws a SyntaxError that
    // names nothing useful, and anything that rounded would issue the wrong
    // number of tokens.
    if (!/^\d+$/.test(raw)) {
      throw new Error(
        `invalid ${MINT_ALLOCATION_TYPE} payload: "tokens" must be a whole number, got "${raw}"`,
      );
    }
    await this.mint.execute({
      offeringId: requireString(payload, "offeringId"),
      tokenAddress: requireString(payload, "tokenAddress"),
      investorId: requireString(payload, "investorId"),
      tokens: BigInt(raw),
    });
  }
}
