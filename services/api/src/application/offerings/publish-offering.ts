import { loadOffering } from "./load-offering.js";
import type { Clock, OfferingRepository } from "./ports.js";

// 2.1a (OD-5): publishing puts an offering in front of anonymous visitors, so it
// is an explicit operator act — never a side effect of opening. Withdrawing is
// the inverse and leaves existing subscriptions untouched; it only removes the
// public listing.
export class PublishOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly clock: Clock,
  ) {}

  async publish(input: { offeringId: string }): Promise<void> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    await this.offerings.save(offering.publish(this.clock.now()));
  }

  async unpublish(input: { offeringId: string }): Promise<void> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    await this.offerings.save(offering.unpublish());
  }
}
