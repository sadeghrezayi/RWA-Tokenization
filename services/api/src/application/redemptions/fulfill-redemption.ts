import { redemptionPayout } from "../../domain/redemptions/redemption.js";
import type { AssetEventLog } from "../assets/ports.js";
import type { AttestationRepository } from "../attestations/ports.js";
import type { HolderSnapshotProvider } from "../distributions/ports.js";
import type { Clock } from "../offerings/ports.js";
import { NoFreshValuationError, RedemptionNotFoundError } from "./errors.js";
import type { AssetTokenBurner, RedemptionLedger, RedemptionRepository } from "./ports.js";

// FR-TR-2 fulfillment: price at the latest FRESH valuation (P5 — the payout
// traces to a signed attestation; FR-OR-3 — no fresh valuation, no action),
// then burn on-chain FIRST (point of no return; prevents pay-without-burn),
// then persist + credit the Rial ledger. A crash after the burn is visible in
// the audit/chain trail and operator-recoverable.
export class FulfillRedemption {
  constructor(
    private readonly redemptions: RedemptionRepository,
    private readonly attestations: AttestationRepository,
    private readonly snapshots: HolderSnapshotProvider,
    private readonly burner: AssetTokenBurner,
    private readonly ledger: RedemptionLedger,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: { redemptionId: string; actor: string }): Promise<{ payoutRial: string }> {
    const redemption = await this.redemptions.findById(input.redemptionId);
    if (!redemption) {
      throw new RedemptionNotFoundError(input.redemptionId);
    }

    const now = this.clock.now();
    const valuation = await this.attestations.findLatest(redemption.assetId, "valuation");
    if (!valuation?.isFresh(now)) {
      throw new NoFreshValuationError(redemption.assetId);
    }

    const holders = await this.snapshots.snapshot(redemption.tokenAddress);
    const circulatingSupply = holders.reduce((sum, h) => sum + h.tokens, 0n);
    const payoutRial = redemptionPayout(valuation.valueRial, circulatingSupply, redemption.tokens);

    // Validates the requested→fulfilled transition (and payout > 0) BEFORE the burn.
    const fulfilled = redemption.fulfill(payoutRial, now);

    await this.burner.burn(redemption.tokenAddress, redemption.investorId, redemption.tokens);
    await this.redemptions.save(fulfilled);
    await this.ledger.credit(redemption.investorId, payoutRial);
    await this.events.append({
      assetId: redemption.assetId,
      event: "redemption_fulfilled",
      actor: input.actor,
      details: {
        redemptionId: redemption.id,
        tokens: String(redemption.tokens),
        payoutRial: String(payoutRial),
        valuationId: valuation.id,
      },
    });
    return { payoutRial: String(payoutRial) };
  }
}
