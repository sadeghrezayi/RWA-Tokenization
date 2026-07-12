import { beforeEach, describe, expect, it } from "vitest";
import { Distribution } from "../../src/domain/distributions/distribution.js";
import type { DistributionRepository } from "../../src/application/distributions/ports.js";

const declare = (id: string) =>
  Distribution.declare({
    id,
    assetId: "asset-1",
    tokenAddress: "0xToken1",
    totalAmountRial: 100_000n,
    snapshot: [
      { investorId: "a", tokens: 67n },
      { investorId: "b", tokens: 33n },
    ],
  });

// LSP contract: every DistributionRepository implementation must pass unchanged.
export const distributionRepositoryContract = (
  name: string,
  makeRepo: () => Promise<DistributionRepository>,
): void => {
  describe(`DistributionRepository contract — ${name}`, () => {
    let repo: DistributionRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("round_trips_a_declared_distribution_with_payouts", async () => {
      await repo.save(declare("dist-1"));

      const found = await repo.findById("dist-1");
      expect(found?.state).toBe("declared");
      expect(found?.totalAmountRial).toBe(100_000n);
      expect(found?.payouts).toEqual([
        { investorId: "a", tokens: 67n, amountRial: 67_000n },
        { investorId: "b", tokens: 33n, amountRial: 33_000n },
      ]);
    });

    it("save_overwrites_state_from_declared_to_paid", async () => {
      const declared = declare("dist-1");
      await repo.save(declared);
      await repo.save(declared.markPaid());

      const found = await repo.findById("dist-1");
      expect(found?.state).toBe("paid");
      expect(found?.payouts).toHaveLength(2);
    });

    it("lists_all_distributions", async () => {
      await repo.save(declare("dist-1"));
      await repo.save(declare("dist-2"));
      expect((await repo.findAll()).map((d) => d.id).sort()).toEqual(["dist-1", "dist-2"]);
    });
  });
};
