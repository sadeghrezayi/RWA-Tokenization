import { describe, expect, it } from "vitest";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InvalidPasswordHashError } from "../../../src/domain/identity/errors.js";

describe("PasswordHash", () => {
  it("wraps_a_non_empty_hash_verbatim", () => {
    expect(PasswordHash.of("$argon2id$v=19$abc").value).toBe("$argon2id$v=19$abc");
  });

  it.each(["", "   "])("rejects_a_blank_hash_%j", (raw) => {
    expect(() => PasswordHash.of(raw)).toThrow(InvalidPasswordHashError);
  });
});
