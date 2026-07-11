import type { Allocation, OfferingState } from "../../domain/offerings/offering.js";
import type { AssetEventLog } from "../assets/ports.js";
import { loadOffering } from "./load-offering.js";
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

    for (const allocation of allocations) {
      if (allocation.costRial > 0n) {
        await this.rail.capture(allocation.investorId, allocation.costRial);
      }
      if (allocation.refundRial > 0n) {
        await this.rail.release(allocation.investorId, allocation.refundRial);
      }
      if (allocation.allocated > 0n) {
        await this.issuer.mint(closed.tokenAddress, allocation.investorId, allocation.allocated);
      }
    }
    if (closed.state === "closed_success") {
      await this.issuer.finalize(closed.tokenAddress);
    }
    return { state: closed.state, allocations };
  }
}
