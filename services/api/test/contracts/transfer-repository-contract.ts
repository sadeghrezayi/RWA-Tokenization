import { beforeEach, describe, expect, it } from "vitest";
import { TokenTransfer } from "../../src/domain/transfers/token-transfer.js";
import type { TransferRepository } from "../../src/application/transfers/ports.js";

const transfer = (id: string, from: string, to: string) =>
  TokenTransfer.record({
    id,
    assetId: "asset-1",
    tokenAddress: "0xTok1",
    fromInvestorId: from,
    toInvestorId: to,
    tokens: 25n,
    executedAt: new Date("2026-07-14T00:00:00Z"),
  });

// LSP contract: every TransferRepository implementation passes unchanged.
export const transferRepositoryContract = (
  name: string,
  makeRepo: () => Promise<TransferRepository>,
): void => {
  describe(`TransferRepository contract — ${name}`, () => {
    let repo: TransferRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("round_trips_a_transfer_by_asset", async () => {
      await repo.save(transfer("tr-1", "alice", "bob"));

      const list = await repo.findByAsset("asset-1");
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: "tr-1",
        fromInvestorId: "alice",
        toInvestorId: "bob",
        tokens: 25n,
      });
      expect(list[0]?.executedAt.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    });

    it("finds_transfers_touching_an_investor_on_either_side", async () => {
      await repo.save(transfer("tr-1", "alice", "bob"));
      await repo.save(transfer("tr-2", "carol", "alice"));
      await repo.save(transfer("tr-3", "carol", "dave"));

      const forAlice = await repo.findByInvestor("alice");
      expect(forAlice.map((t) => t.id).sort()).toEqual(["tr-1", "tr-2"]);
      expect(await repo.findByAsset("ghost")).toEqual([]);
    });
  });
};
