import { beforeEach, describe, expect, it } from "vitest";
import { Redemption } from "../../src/domain/redemptions/redemption.js";
import type { RedemptionRepository } from "../../src/application/redemptions/ports.js";

const request = (id: string, investorId: string) =>
  Redemption.request({
    id,
    assetId: "asset-1",
    tokenAddress: "0xTok1",
    investorId,
    tokens: 10n,
    requestedAt: new Date("2026-07-14T00:00:00Z"),
  });

// LSP contract: every RedemptionRepository implementation passes unchanged.
export const redemptionRepositoryContract = (
  name: string,
  makeRepo: () => Promise<RedemptionRepository>,
): void => {
  describe(`RedemptionRepository contract — ${name}`, () => {
    let repo: RedemptionRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("round_trips_a_requested_redemption", async () => {
      await repo.save(request("red-1", "alice"));

      const found = await repo.findById("red-1");
      expect(found).toMatchObject({ state: "requested", tokens: 10n, investorId: "alice" });
      expect(found?.payoutRial).toBeUndefined();
      expect(found?.resolvedAt).toBeUndefined();
    });

    it("save_overwrites_with_a_fulfilled_state_and_payout", async () => {
      const req = request("red-1", "alice");
      await repo.save(req);
      await repo.save(req.fulfill(312_500_000n, new Date("2026-07-15T00:00:00Z")));

      const found = await repo.findById("red-1");
      expect(found?.state).toBe("fulfilled");
      expect(found?.payoutRial).toBe(312_500_000n);
      expect(found?.resolvedAt?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    });

    it("round_trips_a_rejection_with_its_reason", async () => {
      const req = request("red-1", "alice");
      await repo.save(req.reject("stale valuation", new Date("2026-07-15T00:00:00Z")));

      const found = await repo.findById("red-1");
      expect(found?.state).toBe("rejected");
      expect(found?.rejectionReason).toBe("stale valuation");
    });

    it("lists_all_and_filters_by_investor", async () => {
      await repo.save(request("red-1", "alice"));
      await repo.save(request("red-2", "bob"));

      expect((await repo.findAll()).map((r) => r.id).sort()).toEqual(["red-1", "red-2"]);
      expect((await repo.findByInvestor("bob")).map((r) => r.id)).toEqual(["red-2"]);
    });
  });
};
