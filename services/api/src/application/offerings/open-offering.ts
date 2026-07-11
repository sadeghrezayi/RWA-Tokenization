import type { AssetEventLog } from "../assets/ports.js";
import { loadOffering } from "./load-offering.js";
import type { Clock, OfferingRepository } from "./ports.js";

export class OpenOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: { offeringId: string; actor: string }): Promise<void> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    await this.offerings.save(offering.open(this.clock.now()));
    await this.events.append({
      assetId: offering.assetId,
      event: "offering_opened",
      actor: input.actor,
      details: { offeringId: offering.id },
    });
  }
}
