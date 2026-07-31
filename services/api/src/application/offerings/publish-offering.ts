import { loadOffering } from "./load-offering.js";
import type { Clock, OfferingRepository, PublicPageRevalidator } from "./ports.js";

// 2.1a (OD-5): publishing puts an offering in front of anonymous visitors, so it
// is an explicit operator act — never a side effect of opening. Withdrawing is
// the inverse and leaves existing subscriptions untouched; it only removes the
// public listing.
export class PublishOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly clock: Clock,
    private readonly revalidator: PublicPageRevalidator,
  ) {}

  async publish(input: { offeringId: string }): Promise<void> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    await this.offerings.save(offering.publish(this.clock.now()));
    await this.purgePublicCache(input.offeringId);
  }

  async unpublish(input: { offeringId: string }): Promise<void> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    await this.offerings.save(offering.unpublish());
    // The withdrawal is already persisted; purging the public cache makes it
    // visible immediately rather than at the end of the ISR window.
    await this.purgePublicCache(input.offeringId);
  }

  // The best-effort guarantee is enforced HERE rather than trusted to each
  // adapter: the publication decision is already committed, so no cache problem
  // may fail the operator's request or leave them unsure whether it took. The
  // web app's ISR window is the fallback.
  private async purgePublicCache(offeringId: string): Promise<void> {
    try {
      await this.revalidator.offeringChanged(offeringId);
    } catch {
      // Intentionally swallowed — see above.
    }
  }
}
