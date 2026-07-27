import type { DistributionPaidNotice, DistributionPaidNotifier } from "../distributions/ports.js";
import type { Notifier } from "./ports.js";

// 1.7c-ii: tells each paid holder what they received. One message per investor
// (the amount differs, so this is not a shared fan-out). Informational rather
// than actionable — the money is already in their ledger balance — so it stays
// in-app and is not emailed.
export class NotifyDistributionPaid implements DistributionPaidNotifier {
  constructor(private readonly notifier: Notifier) {}

  async distributionPaid(notice: DistributionPaidNotice): Promise<void> {
    for (const payout of notice.payouts) {
      await this.notifier.notify(
        { kind: "investor", id: payout.investorId },
        {
          type: "distribution.paid",
          title: "You received a distribution",
          body: `${payout.amountRial.toString()} Rial from ${notice.assetName} has been credited to your balance.`,
        },
      );
    }
  }
}
