import { EscrowMissingForMintError } from "./errors.js";
import type { MintAllocation } from "./mint-allocation.js";
import type { AllocationMintLog, SettlementRail } from "./ports.js";

// Narrow (ISP): settlement needs to know the escrow is there, not everything
// the rail can do. The same port the escrow-release lever uses.
export interface SettlementHeldFundsReader {
  heldFor(investorId: string): Promise<bigint>;
}

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
    private readonly heldFunds: SettlementHeldFundsReader,
    private readonly mints: AllocationMintLog,
  ) {}

  async execute(input: {
    offeringId: string;
    tokenAddress: string;
    investorId: string;
    tokens: bigint;
    costRial: bigint;
  }): Promise<void> {
    // BEFORE the mint, because the mint cannot be undone. Reversing the
    // settlement order to fix K-34 removed "money taken, no tokens" and
    // introduced its mirror — a mint that lands and a capture that then fails,
    // leaving tokens issued for free AND invisible, because every "awaiting
    // mint" report excludes an allocation whose mint is confirmed.
    //
    // Refusing here keeps the allocation UNMINTED, which is the state the
    // escrow reporting and the release lever are both built around.
    // ONLY when something new would actually be minted. A redelivery of an
    // already-settled allocation legitimately arrives with the escrow long
    // since spent on its own capture, and demanding it again would refuse the
    // retry that completes a half-finished settlement — turning an idempotent
    // no-op into a permanent failure.
    const alreadyMinted =
      (await this.mints.stateOf({
        offeringId: input.offeringId,
        investorId: input.investorId,
      })) === "minted";

    if (input.costRial > 0n && !alreadyMinted) {
      const held = await this.heldFunds.heldFor(input.investorId);
      if (held < input.costRial) {
        throw new EscrowMissingForMintError(
          input.offeringId,
          input.investorId,
          input.costRial,
          held,
        );
      }
    }

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
