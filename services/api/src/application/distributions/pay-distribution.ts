import type { DistributionState } from "../../domain/distributions/distribution.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import type { Clock } from "../offerings/ports.js";
import { loadDistribution } from "./get-distribution.js";
import type {
  DistributionLedger,
  DistributionPaidNotifier,
  DistributionRepository,
} from "./ports.js";

// FR-YD-1/2: pay a declared distribution. The state gate is persisted FIRST so
// a re-run cannot double-credit (idempotency), then each holder's Rial balance
// is credited (D5b credit-and-hold — an internal write, no forfeiture path).
export class PayDistribution {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly ledger: DistributionLedger,
    private readonly events: AssetEventLog,
    private readonly assets: AssetRepository,
    private readonly notifier: DistributionPaidNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    distributionId: string;
    actor: string;
  }): Promise<{ state: DistributionState }> {
    const distribution = await loadDistribution(this.distributions, input.distributionId);
    const paid = distribution.markPaid(this.clock.now());
    await this.distributions.save(paid);
    await this.events.append({
      assetId: paid.assetId,
      event: "distribution_paid",
      actor: input.actor,
      details: { distributionId: paid.id, totalAmountRial: String(paid.totalAmountRial) },
    });
    for (const payout of paid.payouts) {
      await this.ledger.payout(payout.investorId, payout.amountRial, paid.id);
    }
    // 1.7c-ii: tell each holder what landed. Notifying AFTER the credits means a
    // notification never promises money that was not actually paid.
    const asset = await this.assets.findById(paid.assetId);
    await this.notifier.distributionPaid({
      distributionId: paid.id,
      assetName: asset?.name ?? `Asset ${paid.assetId.slice(0, 8)}`,
      payouts: paid.payouts.map((p) => ({ investorId: p.investorId, amountRial: p.amountRial })),
    });
    return { state: paid.state };
  }
}
