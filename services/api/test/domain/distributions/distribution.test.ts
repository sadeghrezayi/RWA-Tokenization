import { describe, expect, it } from "vitest";
import { Distribution } from "../../../src/domain/distributions/distribution.js";
import {
  InvalidDistributionError,
  InvalidDistributionTransitionError,
} from "../../../src/domain/distributions/errors.js";

const declare = (totalAmountRial: bigint, snapshot: { investorId: string; tokens: bigint }[]) =>
  Distribution.declare({
    id: "dist-1",
    assetId: "asset-1",
    tokenAddress: "0xToken1",
    totalAmountRial,
    snapshot,
  });

describe("Distribution — declaration and pro-rata math (FR-YD-1)", () => {
  it("declares_with_payouts_computed_from_the_snapshot", () => {
    const dist = declare(100_000n, [
      { investorId: "a", tokens: 67n },
      { investorId: "b", tokens: 33n },
    ]);
    expect(dist.state).toBe("declared");
    expect(dist.totalAmountRial).toBe(100_000n);
    expect(dist.payouts).toEqual([
      { investorId: "a", tokens: 67n, amountRial: 67_000n },
      { investorId: "b", tokens: 33n, amountRial: 33_000n },
    ]);
  });

  it("gives_the_whole_amount_to_a_single_holder", () => {
    const dist = declare(50_000n, [{ investorId: "a", tokens: 10n }]);
    expect(dist.payouts).toEqual([{ investorId: "a", tokens: 10n, amountRial: 50_000n }]);
  });

  it("distributes_the_remainder_to_the_largest_holders_deterministically", () => {
    // total 100001; holdings 50/30/20 → floors 50000/30000/20000 = 100000, leftover 1 → largest (a).
    const dist = declare(100_001n, [
      { investorId: "b", tokens: 30n },
      { investorId: "a", tokens: 50n },
      { investorId: "c", tokens: 20n },
    ]);
    expect(dist.payouts).toEqual([
      { investorId: "a", tokens: 50n, amountRial: 50_001n },
      { investorId: "b", tokens: 30n, amountRial: 30_000n },
      { investorId: "c", tokens: 20n, amountRial: 20_000n },
    ]);
  });

  it("breaks_equal_holdings_ties_by_investor_id_for_the_remainder", () => {
    // total 100; holdings 1/1/1 → floor 33 each = 99, leftover 1 → tie broken by id → a.
    const dist = declare(100n, [
      { investorId: "c", tokens: 1n },
      { investorId: "a", tokens: 1n },
      { investorId: "b", tokens: 1n },
    ]);
    expect(dist.payouts.map((p) => p.amountRial)).toEqual([34n, 33n, 33n]);
    expect(dist.payouts.map((p) => p.investorId)).toEqual(["a", "b", "c"]);
  });

  it("conserves_the_full_amount_across_payouts", () => {
    const dist = declare(1_000_003n, [
      { investorId: "a", tokens: 7n },
      { investorId: "b", tokens: 11n },
      { investorId: "c", tokens: 13n },
    ]);
    const total = dist.payouts.reduce((s, p) => s + p.amountRial, 0n);
    expect(total).toBe(1_000_003n);
    for (const p of dist.payouts) {
      expect(p.amountRial >= 0n).toBe(true);
    }
  });

  it.each([0n, -1n])("rejects_a_non_positive_amount_%s", (amount) => {
    expect(() => declare(amount, [{ investorId: "a", tokens: 1n }])).toThrow(
      InvalidDistributionError,
    );
  });

  it("rejects_an_empty_snapshot", () => {
    expect(() => declare(1_000n, [])).toThrow(InvalidDistributionError);
  });

  it("rejects_a_snapshot_entry_with_non_positive_tokens", () => {
    expect(() =>
      declare(1_000n, [
        { investorId: "a", tokens: 5n },
        { investorId: "b", tokens: 0n },
      ]),
    ).toThrow(InvalidDistributionError);
  });
});

describe("Distribution — lifecycle (FR-YD-2 idempotency)", () => {
  it("moves_declared_to_paid", () => {
    const paid = declare(100n, [{ investorId: "a", tokens: 1n }]).markPaid();
    expect(paid.state).toBe("paid");
  });

  it("rejects_paying_twice", () => {
    const paid = declare(100n, [{ investorId: "a", tokens: 1n }]).markPaid();
    expect(() => paid.markPaid()).toThrow(InvalidDistributionTransitionError);
  });

  it("is_immutable_mark_paid_returns_a_new_distribution", () => {
    const declared = declare(100n, [{ investorId: "a", tokens: 1n }]);
    declared.markPaid();
    expect(declared.state).toBe("declared");
  });
});

describe("Distribution — persistence seam", () => {
  it("restores_a_distribution_verbatim", () => {
    const declared = declare(100_000n, [
      { investorId: "a", tokens: 67n },
      { investorId: "b", tokens: 33n },
    ]);
    const restored = Distribution.restore({
      id: declared.id,
      assetId: declared.assetId,
      tokenAddress: declared.tokenAddress,
      totalAmountRial: declared.totalAmountRial,
      state: "paid",
      payouts: declared.payouts,
    });
    expect(restored.state).toBe("paid");
    expect(restored.payouts).toEqual(declared.payouts);
    expect(() => restored.markPaid()).toThrow(InvalidDistributionTransitionError);
  });
});
