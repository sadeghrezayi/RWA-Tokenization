import { describe, expect, it } from "vitest";
import { PublishOffering } from "../../../src/application/offerings/publish-offering.js";
import type { PublicPageRevalidator } from "../../../src/application/offerings/ports.js";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { InMemoryOfferingRepository, FixedClock } from "../../fakes/offering-fakes.js";

const NOW = new Date("2026-07-31T10:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");

class RecordingRevalidator implements PublicPageRevalidator {
  readonly purged: string[] = [];
  offeringChanged(offeringId: string): Promise<void> {
    this.purged.push(offeringId);
    return Promise.resolve();
  }
}

// A revalidator that blows up — the public cache is a best-effort concern and
// must never be able to undo or block a publication decision.
class BrokenRevalidator implements PublicPageRevalidator {
  offeringChanged(): Promise<void> {
    return Promise.reject(new Error("web app unreachable"));
  }
}

const setup = async (revalidator: PublicPageRevalidator = new RecordingRevalidator()) => {
  const offerings = new InMemoryOfferingRepository();
  await offerings.save(
    Offering.create({
      id: "off-1",
      assetId: "asset-1",
      tokenAddress: "0xToken",
      supply: 100n,
      priceRial: 1_000n,
      minPerInvestor: 1n,
      maxPerInvestor: 50n,
      minimumRaise: 10n,
      opensAt: new Date("2026-07-01T00:00:00Z"),
      closesAt: new Date("2026-08-10T00:00:00Z"),
    }).open(DURING),
  );
  return {
    offerings,
    revalidator,
    publish: new PublishOffering(offerings, new FixedClock(NOW), revalidator),
  };
};

describe("PublishOffering", () => {
  it("publishes and purges the public cache", async () => {
    const s = await setup();
    const revalidator = s.revalidator as RecordingRevalidator;

    await s.publish.publish({ offeringId: "off-1" });

    expect((await s.offerings.findById("off-1"))?.isPubliclyListed()).toBe(true);
    expect(revalidator.purged).toEqual(["off-1"]);
  });

  it("purges on WITHDRAWAL too — a cached page must stop advertising it", async () => {
    const s = await setup();
    const revalidator = s.revalidator as RecordingRevalidator;
    await s.publish.publish({ offeringId: "off-1" });

    await s.publish.unpublish({ offeringId: "off-1" });

    expect((await s.offerings.findById("off-1"))?.isPubliclyListed()).toBe(false);
    // Once for publish, once for withdrawal.
    expect(revalidator.purged).toEqual(["off-1", "off-1"]);
  });

  it("succeeds even when the cache purge fails", async () => {
    // The decision is already persisted, so a broken web app must NOT fail the
    // operator's request — they would be left unsure whether it took effect.
    const s = await setup(new BrokenRevalidator());

    await expect(s.publish.publish({ offeringId: "off-1" })).resolves.toBeUndefined();
    expect((await s.offerings.findById("off-1"))?.isPubliclyListed()).toBe(true);

    await expect(s.publish.unpublish({ offeringId: "off-1" })).resolves.toBeUndefined();
    expect((await s.offerings.findById("off-1"))?.isPubliclyListed()).toBe(false);
  });
});
