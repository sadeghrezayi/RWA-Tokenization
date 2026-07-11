import type { InvestorRepository } from "../identity/ports.js";
import type { AssetEventLog } from "../assets/ports.js";
import { loadInvestor } from "../identity/load-investor.js";
import { InvestorNotEligibleError } from "./errors.js";
import { loadOffering } from "./load-offering.js";
import type { Clock, OfferingRepository, SettlementRail } from "./ports.js";

export class SubscribeToOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly investors: InvestorRepository,
    private readonly rail: SettlementRail,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: { offeringId: string; investorId: string; tokens: bigint }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    if (!investor.isEligibleForClaims()) {
      throw new InvestorNotEligibleError();
    }
    const offering = await loadOffering(this.offerings, input.offeringId);
    // Domain validation first (window, caps) — no funds move for a doomed request.
    const subscribed = offering.subscribe(input.investorId, input.tokens, this.clock.now());

    const costRial = input.tokens * offering.priceRial;
    await this.rail.hold(input.investorId, costRial);
    try {
      await this.offerings.save(subscribed);
    } catch (error) {
      // Compensate: never leave funds in escrow without a recorded subscription.
      await this.rail.release(input.investorId, costRial);
      throw error;
    }
    await this.events.append({
      assetId: offering.assetId,
      event: "offering_subscribed",
      actor: input.investorId,
      details: {
        offeringId: offering.id,
        tokens: String(input.tokens),
        costRial: String(costRial),
      },
    });
  }
}
