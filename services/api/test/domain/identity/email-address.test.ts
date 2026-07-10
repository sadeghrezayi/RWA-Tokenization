import { describe, expect, it } from "vitest";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { InvalidEmailError } from "../../../src/domain/identity/errors.js";

describe("EmailAddress", () => {
  it("accepts_a_well_formed_address", () => {
    expect(EmailAddress.of("investor@example.com").value).toBe("investor@example.com");
  });

  it("normalizes_case_and_surrounding_whitespace", () => {
    expect(EmailAddress.of("  Investor@Example.COM ").value).toBe("investor@example.com");
  });

  it("compares_by_value", () => {
    expect(EmailAddress.of("a@b.io").equals(EmailAddress.of("A@b.io"))).toBe(true);
    expect(EmailAddress.of("a@b.io").equals(EmailAddress.of("c@b.io"))).toBe(false);
  });

  it.each(["", "   ", "no-at-sign", "@nodomain", "user@", "user@nodot", "a b@c.io"])(
    "rejects_malformed_address_%s",
    (raw) => {
      expect(() => EmailAddress.of(raw)).toThrow(InvalidEmailError);
    },
  );
});
