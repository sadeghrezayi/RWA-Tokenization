import { describe, expect, it } from "vitest";
import {
  PAYMENT_REFERENCE_ALPHABET,
  newPaymentReference,
} from "../../../src/application/funding/payment-reference.js";

describe("newPaymentReference", () => {
  it("is short enough to copy onto a bank form", () => {
    const reference = newPaymentReference();
    expect(reference.length).toBeLessThanOrEqual(12);
    expect(reference.startsWith("TP-")).toBe(true);
  });

  it("avoids characters people confuse when transcribing", () => {
    // A reference is typed by hand into a bank's payment form, often from a
    // phone screen. O/0, I/1/L and S/5 are where that goes wrong.
    for (const forbidden of ["O", "0", "I", "1", "L", "S", "5"]) {
      expect(PAYMENT_REFERENCE_ALPHABET).not.toContain(forbidden);
    }
    const body = newPaymentReference().slice(3);
    for (const character of body) {
      expect(PAYMENT_REFERENCE_ALPHABET).toContain(character);
    }
  });

  it("does not repeat itself in practice", () => {
    // Two investors sharing a reference would make a bank line unattributable.
    const drawn = new Set(Array.from({ length: 2000 }, () => newPaymentReference()));
    expect(drawn.size).toBe(2000);
  });
});
