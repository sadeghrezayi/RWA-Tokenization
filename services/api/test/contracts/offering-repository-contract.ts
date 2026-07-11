import { beforeEach, describe, expect, it } from "vitest";
import { Offering } from "../../src/domain/offerings/offering.js";
import type { OfferingRepository } from "../../src/application/offerings/ports.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-07-10T00:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");

const draft = (id: string) =>
  Offering.create({
    id,
    assetId: "asset-1",
    tokenAddress: "0xToken1",
    supply: 100n,
    priceRial: 1_000n,
    minPerInvestor: 5n,
    maxPerInvestor: 80n,
    minimumRaise: 20n,
    opensAt: OPENS,
    closesAt: CLOSES,
  });

// LSP contract: every OfferingRepository implementation must pass unchanged.
export const offeringRepositoryContract = (
  name: string,
  makeRepo: () => Promise<OfferingRepository>,
): void => {
  describe(`OfferingRepository contract — ${name}`, () => {
    let repo: OfferingRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("round_trips_a_draft_offering_with_exact_amounts_and_window", async () => {
      await repo.save(draft("off-1"));

      const found = await repo.findById("off-1");
      expect(found?.state).toBe("draft");
      expect(found?.supply).toBe(100n);
      expect(found?.priceRial).toBe(1_000n);
      expect(found?.minimumRaise).toBe(20n);
      expect(found?.opensAt.toISOString()).toBe(OPENS.toISOString());
      expect(found?.closesAt.toISOString()).toBe(CLOSES.toISOString());
      expect(found?.subscriptions).toEqual([]);
      expect(found?.allocations).toBeUndefined();
    });

    it("round_trips_subscriptions_in_order", async () => {
      const offering = draft("off-1")
        .open(DURING)
        .subscribe("inv-1", 30n, DURING)
        .subscribe("inv-2", 20n, DURING)
        .subscribe("inv-1", 10n, DURING);
      await repo.save(offering);

      const found = await repo.findById("off-1");
      expect(found?.state).toBe("open");
      expect(found?.subscriptions).toEqual([
        { investorId: "inv-1", tokens: 30n },
        { investorId: "inv-2", tokens: 20n },
        { investorId: "inv-1", tokens: 10n },
      ]);
    });

    it("round_trips_a_closed_offering_with_allocations", async () => {
      const closed = draft("off-1")
        .open(DURING)
        .subscribe("inv-1", 80n, DURING)
        .subscribe("inv-2", 40n, DURING)
        .close(AFTER);
      await repo.save(closed);

      const found = await repo.findById("off-1");
      expect(found?.state).toBe("closed_success");
      expect(found?.allocations).toEqual(closed.allocations);
    });

    it("save_overwrites_existing_state", async () => {
      const offering = draft("off-1");
      await repo.save(offering);
      await repo.save(offering.open(DURING).subscribe("inv-1", 10n, DURING));

      const found = await repo.findById("off-1");
      expect(found?.state).toBe("open");
      expect(found?.subscriptions).toHaveLength(1);
    });

    it("lists_all_offerings", async () => {
      await repo.save(draft("off-1"));
      await repo.save(draft("off-2"));
      expect((await repo.findAll()).map((o) => o.id).sort()).toEqual(["off-1", "off-2"]);
    });
  });
};
