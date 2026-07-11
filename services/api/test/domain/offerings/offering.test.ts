import { describe, expect, it } from "vitest";
import { Offering } from "../../../src/domain/offerings/offering.js";
import {
  InvalidOfferingConfigError,
  InvalidOfferingTransitionError,
  SubscriptionLimitError,
  SubscriptionWindowClosedError,
} from "../../../src/domain/offerings/errors.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-07-10T00:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");

const BASE = {
  id: "off-1",
  assetId: "asset-1",
  tokenAddress: "0xToken1",
  supply: 100n,
  priceRial: 1_000n,
  minPerInvestor: 5n,
  maxPerInvestor: 80n,
  minimumRaise: 20n,
  opensAt: OPENS,
  closesAt: CLOSES,
};

const draft = (overrides: Partial<typeof BASE> = {}) => Offering.create({ ...BASE, ...overrides });

const open = () => draft().open(DURING);

describe("Offering configuration (FR-PI-1)", () => {
  it("creates_a_draft_offering", () => {
    const offering = draft();
    expect(offering.state).toBe("draft");
    expect(offering.supply).toBe(100n);
    expect(offering.subscriptions).toEqual([]);
  });

  it.each([
    ["zero_supply", { supply: 0n }],
    ["zero_price", { priceRial: 0n }],
    ["zero_min", { minPerInvestor: 0n }],
    ["min_above_max", { minPerInvestor: 90n, maxPerInvestor: 80n }],
    ["max_above_supply", { maxPerInvestor: 101n }],
    ["raise_above_supply", { minimumRaise: 101n }],
    ["window_inverted", { opensAt: CLOSES, closesAt: OPENS }],
  ])("rejects_invalid_config_%s", (_name, overrides) => {
    expect(() => draft(overrides)).toThrow(InvalidOfferingConfigError);
  });
});

describe("Opening and subscribing (FR-PI-2)", () => {
  it("opens_a_draft_offering", () => {
    expect(open().state).toBe("open");
  });

  it("rejects_opening_twice_or_after_the_window", () => {
    expect(() => open().open(DURING)).toThrow(InvalidOfferingTransitionError);
    expect(() => draft().open(AFTER)).toThrow(InvalidOfferingTransitionError);
  });

  it("records_a_subscription_inside_the_window", () => {
    const offering = open().subscribe("inv-1", 10n, DURING);
    expect(offering.subscriptions).toEqual([{ investorId: "inv-1", tokens: 10n }]);
  });

  it("rejects_subscribing_to_a_draft_offering", () => {
    expect(() => draft().subscribe("inv-1", 10n, DURING)).toThrow(InvalidOfferingTransitionError);
  });

  it.each([
    ["before_window", new Date("2026-06-30T23:59:59Z")],
    ["after_window", AFTER],
  ])("rejects_subscription_%s", (_name, when) => {
    expect(() => open().subscribe("inv-1", 10n, when)).toThrow(SubscriptionWindowClosedError);
  });

  it("enforces_the_per_investor_minimum", () => {
    expect(() => open().subscribe("inv-1", 4n, DURING)).toThrow(SubscriptionLimitError);
  });

  it("enforces_the_per_investor_maximum_cumulatively", () => {
    const offering = open().subscribe("inv-1", 50n, DURING);
    expect(() => offering.subscribe("inv-1", 31n, DURING)).toThrow(SubscriptionLimitError);
    expect(offering.subscribe("inv-1", 30n, DURING).subscriptions).toHaveLength(2);
  });

  it("allows_total_demand_beyond_supply_for_pro_rata_close", () => {
    const offering = open()
      .subscribe("inv-1", 80n, DURING)
      .subscribe("inv-2", 80n, DURING)
      .subscribe("inv-3", 80n, DURING);
    expect(offering.subscriptions).toHaveLength(3);
  });
});

describe("Closing (FR-PI-3 + D5 pro-rata)", () => {
  it("rejects_closing_before_the_window_ends_or_when_not_open", () => {
    expect(() => open().close(DURING)).toThrow(InvalidOfferingTransitionError);
    expect(() => draft().close(AFTER)).toThrow(InvalidOfferingTransitionError);
  });

  it("fails_the_raise_below_minimum_with_full_refunds_and_no_allocation", () => {
    const closed = open().subscribe("inv-1", 10n, DURING).close(AFTER);
    expect(closed.state).toBe("closed_failed");
    expect(closed.allocations).toEqual([
      { investorId: "inv-1", requested: 10n, allocated: 0n, costRial: 0n, refundRial: 10_000n },
    ]);
  });

  it("allocates_fully_when_demand_is_within_supply", () => {
    const closed = open()
      .subscribe("inv-1", 30n, DURING)
      .subscribe("inv-2", 20n, DURING)
      .close(AFTER);
    expect(closed.state).toBe("closed_success");
    expect(closed.allocations).toEqual([
      { investorId: "inv-1", requested: 30n, allocated: 30n, costRial: 30_000n, refundRial: 0n },
      { investorId: "inv-2", requested: 20n, allocated: 20n, costRial: 20_000n, refundRial: 0n },
    ]);
  });

  it("merges_multiple_subscriptions_from_the_same_investor", () => {
    const closed = open()
      .subscribe("inv-1", 10n, DURING)
      .subscribe("inv-2", 20n, DURING)
      .subscribe("inv-1", 15n, DURING)
      .close(AFTER);
    expect(closed.allocations).toEqual([
      { investorId: "inv-1", requested: 25n, allocated: 25n, costRial: 25_000n, refundRial: 0n },
      { investorId: "inv-2", requested: 20n, allocated: 20n, costRial: 20_000n, refundRial: 0n },
    ]);
  });

  it("allocates_pro_rata_with_deterministic_remainder_when_oversubscribed", () => {
    // supply 100; requests 80 + 40 = 120 → floors 66 + 33 = 99, leftover 1 → first investor.
    const closed = open()
      .subscribe("inv-1", 80n, DURING)
      .subscribe("inv-2", 40n, DURING)
      .close(AFTER);
    expect(closed.state).toBe("closed_success");
    expect(closed.allocations).toEqual([
      {
        investorId: "inv-1",
        requested: 80n,
        allocated: 67n,
        costRial: 67_000n,
        refundRial: 13_000n,
      },
      {
        investorId: "inv-2",
        requested: 40n,
        allocated: 33n,
        costRial: 33_000n,
        refundRial: 7_000n,
      },
    ]);
  });

  it("never_allocates_more_than_requested_or_more_than_supply", () => {
    const closed = open()
      .subscribe("inv-1", 80n, DURING)
      .subscribe("inv-2", 80n, DURING)
      .subscribe("inv-3", 5n, DURING)
      .close(AFTER);
    const allocations = closed.allocations ?? [];
    expect(allocations).toHaveLength(3);
    const total = allocations.reduce((s, a) => s + a.allocated, 0n);
    expect(total).toBe(100n);
    for (const a of allocations) {
      expect(a.allocated <= a.requested).toBe(true);
      expect(a.costRial + a.refundRial).toBe(a.requested * 1_000n);
    }
  });

  it("counts_the_minimum_raise_against_total_demand", () => {
    const closed = open().subscribe("inv-1", 20n, DURING).close(AFTER);
    expect(closed.state).toBe("closed_success");
  });

  it("rejects_actions_after_close", () => {
    const closed = open().subscribe("inv-1", 30n, DURING).close(AFTER);
    expect(() => closed.subscribe("inv-2", 10n, AFTER)).toThrow(InvalidOfferingTransitionError);
    expect(() => closed.close(AFTER)).toThrow(InvalidOfferingTransitionError);
  });

  it("is_immutable_close_returns_a_new_offering", () => {
    const opened = open().subscribe("inv-1", 30n, DURING);
    opened.close(AFTER);
    expect(opened.state).toBe("open");
    expect(opened.allocations).toBeUndefined();
  });
});

describe("Persistence seam", () => {
  it("restores_an_offering_verbatim", () => {
    const closed = open().subscribe("inv-1", 30n, DURING).close(AFTER);
    const restored = Offering.restore({
      id: closed.id,
      assetId: closed.assetId,
      tokenAddress: closed.tokenAddress,
      supply: closed.supply,
      priceRial: closed.priceRial,
      minPerInvestor: closed.minPerInvestor,
      maxPerInvestor: closed.maxPerInvestor,
      minimumRaise: closed.minimumRaise,
      opensAt: closed.opensAt,
      closesAt: closed.closesAt,
      state: closed.state,
      subscriptions: closed.subscriptions,
      allocations: closed.allocations,
    });
    expect(restored.state).toBe("closed_success");
    expect(restored.allocations).toEqual(closed.allocations);
  });
});
