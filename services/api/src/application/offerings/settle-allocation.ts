import type { MintAllocation } from "./mint-allocation.js";
import type { SettlementRail } from "./ports.js";

// What a capture is FOR, written into the ledger entry's `reference`. Prefixed
// because that column also carries distribution ids (FR-RA-4), and an auditor
// reading the ledger should not have to guess which kind of id they are looking
// at. Exported so the test and the rail agree on one spelling (DRY).
export const captureReferenceFor = (offeringId: string): string => `offering:${offeringId}`;

// P0-2 step 3 — the fix for K-34.
//
// Settling one allocation is mint-then-capture, in that order, as a single
// unit. The order is the entire point: `CloseOffering` used to capture first,
// so when the chain refused the mint the investor had paid for tokens that
// were never issued. Money is now taken only once the tokens exist, and a
// failure leaves the Rial held in escrow — still wrong, but recoverable by
// releasing a hold rather than by reversing a payment.
//
// One unit rather than two calls in `CloseOffering` because step 2 retries
// settlement through the outbox: whatever the retry re-runs must contain BOTH
// halves, or a queued retry would mint without ever capturing.
export class SettleAllocation {
  constructor(
    private readonly mint: MintAllocation,
    private readonly rail: SettlementRail,
  ) {}

  async execute(input: {
    offeringId: string;
    tokenAddress: string;
    investorId: string;
    tokens: bigint;
    costRial: bigint;
  }): Promise<void> {
    await this.mint.execute({
      offeringId: input.offeringId,
      tokenAddress: input.tokenAddress,
      investorId: input.investorId,
      tokens: input.tokens,
    });

    // Only reached when the mint has been confirmed — `MintAllocation` throws
    // on refusal and on an unresolved attempt, both of which must stop the
    // money moving.
    if (input.costRial > 0n) {
      await this.rail.capture(
        input.investorId,
        input.costRial,
        captureReferenceFor(input.offeringId),
      );
    }
  }
}
