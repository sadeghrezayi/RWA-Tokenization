import type { AssetEventLog } from "../assets/ports.js";
import type { Clock } from "../offerings/ports.js";
import { RedemptionNotFoundError } from "./errors.js";
import type { RedemptionRepository } from "./ports.js";

export class RejectRedemption {
  constructor(
    private readonly redemptions: RedemptionRepository,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: { redemptionId: string; reason: string; actor: string }): Promise<void> {
    const redemption = await this.redemptions.findById(input.redemptionId);
    if (!redemption) {
      throw new RedemptionNotFoundError(input.redemptionId);
    }
    const rejected = redemption.reject(input.reason, this.clock.now());
    await this.redemptions.save(rejected);
    await this.events.append({
      assetId: redemption.assetId,
      event: "redemption_rejected",
      actor: input.actor,
      details: { redemptionId: redemption.id, reason: input.reason },
    });
  }
}
