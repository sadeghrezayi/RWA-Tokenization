import type { DistributionState } from "../../domain/distributions/distribution.js";
import type { AssetEventLog } from "../assets/ports.js";
import { loadDistribution } from "./get-distribution.js";
import type { DistributionLedger, DistributionRepository } from "./ports.js";

// FR-YD-1/2: pay a declared distribution. The state gate is persisted FIRST so
// a re-run cannot double-credit (idempotency), then each holder's Rial balance
// is credited (D5b credit-and-hold — an internal write, no forfeiture path).
export class PayDistribution {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly ledger: DistributionLedger,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    distributionId: string;
    actor: string;
  }): Promise<{ state: DistributionState }> {
    const distribution = await loadDistribution(this.distributions, input.distributionId);
    const paid = distribution.markPaid();
    await this.distributions.save(paid);
    await this.events.append({
      assetId: paid.assetId,
      event: "distribution_paid",
      actor: input.actor,
      details: { distributionId: paid.id, totalAmountRial: String(paid.totalAmountRial) },
    });
    for (const payout of paid.payouts) {
      await this.ledger.payout(payout.investorId, payout.amountRial);
    }
    return { state: paid.state };
  }
}
