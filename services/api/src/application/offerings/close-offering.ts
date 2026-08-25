import type { Allocation, OfferingState } from "../../domain/offerings/offering.js";
import type { AssetEventLog } from "../assets/ports.js";
import { loadOffering } from "./load-offering.js";
import type { SettleWithRetry } from "./settle-with-retry.js";
import type { AssetTokenIssuer, Clock, OfferingRepository, SettlementRail } from "./ports.js";

// FR-PI-3: the close decision persists FIRST (like a compliance decision),
// then settlement and minting execute per allocation. A mid-settlement crash
// leaves an audit-visible, operator-retryable state — never silent reversal.
export class CloseOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly rail: SettlementRail,
    private readonly issuer: AssetTokenIssuer,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
    // P0-2 steps 1-3: settles one allocation — mint, then capture — idempotently
    // and inline, handing it to the outbox to retry if the chain refuses. A
    // mint that fails because the holder's KYC claim has not drained yet
    // neither fails the close nor takes the investor's money (K-34).
    private readonly settleAllocation: SettleWithRetry,
  ) {}

  async execute(input: {
    offeringId: string;
    actor: string;
  }): Promise<{ state: OfferingState; allocations: readonly Allocation[] }> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    const closed = offering.close(this.clock.now());
    const allocations = closed.allocations ?? [];
    await this.offerings.save(closed);
    await this.events.append({
      assetId: closed.assetId,
      event: "offering_closed",
      actor: input.actor,
      details: {
        offeringId: closed.id,
        outcome: closed.state,
        investors: String(allocations.length),
      },
    });

    await this.settleAllocations(closed.id, closed.tokenAddress, allocations);
    if (closed.state === "closed_success") {
      await this.issuer.finalize(closed.tokenAddress);
    }
    return { state: closed.state, allocations };
  }

  private async settleAllocations(
    offeringId: string,
    tokenAddress: string,
    allocations: readonly Allocation[],
  ): Promise<void> {
    for (const allocation of allocations) {
      // The refund first, and unconditionally: over-subscribed money was never
      // owed, so it goes back whether or not the mint that follows succeeds.
      if (allocation.refundRial > 0n) {
        await this.rail.release(allocation.investorId, allocation.refundRial);
      }
      // Mint THEN capture, as one retryable unit. The capture used to happen
      // here, before the mint, which is how a refused mint left an investor
      // who had paid and held nothing (K-34).
      if (allocation.allocated > 0n) {
        await this.settleAllocation.execute({
          offeringId,
          tokenAddress,
          investorId: allocation.investorId,
          tokens: allocation.allocated,
          costRial: allocation.costRial,
        });
      }
    }
  }
}
