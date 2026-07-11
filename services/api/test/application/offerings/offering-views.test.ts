import { describe, expect, it } from "vitest";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { toOfferingView } from "../../../src/application/offerings/get-offering.js";

const DURING = new Date("2026-07-05T12:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");

const closed = Offering.create({
  id: "off-1",
  assetId: "asset-1",
  tokenAddress: "0xToken1",
  supply: 100n,
  priceRial: 1_000n,
  minPerInvestor: 5n,
  maxPerInvestor: 80n,
  minimumRaise: 20n,
  opensAt: new Date("2026-07-01T00:00:00Z"),
  closesAt: new Date("2026-07-10T00:00:00Z"),
})
  .open(DURING)
  .subscribe("inv-1", 80n, DURING)
  .subscribe("inv-2", 40n, DURING)
  .close(AFTER);

describe("toOfferingView", () => {
  it("serializes_amounts_as_strings_and_never_lists_other_investors", () => {
    const view = toOfferingView(closed, "inv-2");
    expect(view.supply).toBe("100");
    expect(view.totalSubscribed).toBe("120");
    expect(view.mySubscribed).toBe("40");
    expect(view.myAllocation).toEqual({
      requested: "40",
      allocated: "33",
      costRial: "33000",
      refundRial: "7000",
    });
    expect(JSON.stringify(view)).not.toContain("inv-1");
  });

  it("omits_personal_fields_without_an_investor_context", () => {
    const view = toOfferingView(closed);
    expect(view.mySubscribed).toBeUndefined();
    expect(view.myAllocation).toBeUndefined();
  });
});
