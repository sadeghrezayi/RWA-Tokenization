import { describe, expect, it } from "vitest";
import { formatRial, formatTokens, truncateAddress } from "../lib/format";

describe("formatRial", () => {
  it("groups_thousands_and_appends_the_rial_symbol", () => {
    expect(formatRial("500000")).toBe("500,000 ﷼");
    expect(formatRial("1000")).toBe("1,000 ﷼");
    expect(formatRial("0")).toBe("0 ﷼");
  });

  it("accepts_bigint_and_number", () => {
    expect(formatRial(67000n)).toBe("67,000 ﷼");
    expect(formatRial(42)).toBe("42 ﷼");
  });

  it("handles_very_large_amounts_without_precision_loss", () => {
    expect(formatRial("1000000000000000")).toBe("1,000,000,000,000,000 ﷼");
  });

  it("returns_a_dash_for_a_non_numeric_value", () => {
    expect(formatRial("not-a-number")).toBe("—");
  });
});

describe("formatTokens", () => {
  it("groups_thousands_without_a_currency_symbol", () => {
    expect(formatTokens("1000")).toBe("1,000");
    expect(formatTokens(67n)).toBe("67");
  });
});

describe("truncateAddress", () => {
  it("keeps_the_prefix_and_suffix", () => {
    expect(truncateAddress("0xaB837301d12cDc4b97f1E910FC56C9179894d9cf")).toBe("0xaB83…d9cf");
  });

  it("returns_short_values_unchanged", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });

  it("tolerates_undefined", () => {
    expect(truncateAddress(undefined)).toBe("—");
  });
});
