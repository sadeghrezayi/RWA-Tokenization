import { describe, expect, it } from "vitest";
import { Redemption, redemptionPayout } from "../../../src/domain/redemptions/redemption.js";
import {
  InvalidRedemptionError,
  InvalidRedemptionTransitionError,
} from "../../../src/domain/redemptions/errors.js";

const REQUESTED_AT = new Date("2026-07-14T00:00:00Z");
const RESOLVED_AT = new Date("2026-07-15T00:00:00Z");

const request = (tokens = 25n) =>
  Redemption.request({
    id: "red-1",
    assetId: "asset-1",
    tokenAddress: "0xTok1",
    investorId: "alice",
    tokens,
    requestedAt: REQUESTED_AT,
  });

describe("Redemption lifecycle (FR-TR-2)", () => {
  it("requests_a_redemption_of_a_positive_amount", () => {
    const r = request();
    expect(r).toMatchObject({
      id: "red-1",
      assetId: "asset-1",
      investorId: "alice",
      tokens: 25n,
      state: "requested",
      requestedAt: REQUESTED_AT,
    });
    expect(r.payoutRial).toBeUndefined();
    expect(r.resolvedAt).toBeUndefined();
  });

  it.each([0n, -1n])("rejects_a_non_positive_amount_%s", (tokens) => {
    expect(() => request(tokens)).toThrow(InvalidRedemptionError);
  });

  it("fulfills_with_the_computed_payout", () => {
    const fulfilled = request().fulfill(1_250_000n, RESOLVED_AT);
    expect(fulfilled.state).toBe("fulfilled");
    expect(fulfilled.payoutRial).toBe(1_250_000n);
    expect(fulfilled.resolvedAt).toEqual(RESOLVED_AT);
  });

  it("rejects_fulfilling_with_a_non_positive_payout", () => {
    expect(() => request().fulfill(0n, RESOLVED_AT)).toThrow(InvalidRedemptionError);
  });

  it("rejects_with_a_reason", () => {
    const rejected = request().reject("no fresh valuation", RESOLVED_AT);
    expect(rejected.state).toBe("rejected");
    expect(rejected.rejectionReason).toBe("no fresh valuation");
    expect(rejected.resolvedAt).toEqual(RESOLVED_AT);
  });

  it("rejects_a_blank_rejection_reason", () => {
    expect(() => request().reject("  ", RESOLVED_AT)).toThrow(InvalidRedemptionError);
  });

  it("rejects_double_resolution", () => {
    const fulfilled = request().fulfill(1_000n, RESOLVED_AT);
    expect(() => fulfilled.fulfill(1_000n, RESOLVED_AT)).toThrow(InvalidRedemptionTransitionError);
    expect(() => fulfilled.reject("late", RESOLVED_AT)).toThrow(InvalidRedemptionTransitionError);
  });

  it("is_immutable_resolution_returns_a_new_redemption", () => {
    const r = request();
    r.fulfill(1_000n, RESOLVED_AT);
    expect(r.state).toBe("requested");
  });

  it("restores_verbatim", () => {
    const restored = Redemption.restore({
      id: "red-9",
      assetId: "asset-1",
      tokenAddress: "0xTok1",
      investorId: "bob",
      tokens: 10n,
      state: "fulfilled",
      requestedAt: REQUESTED_AT,
      payoutRial: 500_000n,
      resolvedAt: RESOLVED_AT,
    });
    expect(restored.state).toBe("fulfilled");
    expect(restored.payoutRial).toBe(500_000n);
    expect(() => restored.reject("x", RESOLVED_AT)).toThrow(InvalidRedemptionTransitionError);
  });
});

describe("redemptionPayout (attested value per token)", () => {
  it("pays_pro_rata_share_of_the_attested_valuation", () => {
    // valuation 12,500,000,000 over 1,000 tokens → 12,500,000 per token.
    expect(redemptionPayout(12_500_000_000n, 1_000n, 25n)).toBe(312_500_000n);
  });

  it("floors_fractional_results", () => {
    // 100 valuation / 3 supply * 2 tokens = 66.66… → 66.
    expect(redemptionPayout(100n, 3n, 2n)).toBe(66n);
  });

  it("rejects_a_zero_supply", () => {
    expect(() => redemptionPayout(100n, 0n, 1n)).toThrow(InvalidRedemptionError);
  });

  it("rejects_redeeming_more_than_the_circulating_supply", () => {
    expect(() => redemptionPayout(100n, 10n, 11n)).toThrow(InvalidRedemptionError);
  });
});
