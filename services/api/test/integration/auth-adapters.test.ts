import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../../src/infrastructure/auth/argon2-password-hasher.js";
import { JwtTokenService } from "../../src/infrastructure/auth/jwt-token-service.js";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("round_trips_a_password_with_argon2id", async () => {
    const hash = await hasher.hash("s3cure-pass");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await hasher.verify("s3cure-pass", hash)).toBe(true);
  });

  it("rejects_a_wrong_password", async () => {
    const hash = await hasher.hash("s3cure-pass");
    expect(await hasher.verify("wrong-pass", hash)).toBe(false);
  });

  it("treats_a_malformed_stored_hash_as_failed_verification", async () => {
    expect(await hasher.verify("anything", "not-a-hash")).toBe(false);
  });
});

describe("JwtTokenService", () => {
  it("round_trips_a_principal", async () => {
    const service = new JwtTokenService("test-secret");
    const token = await service.issue({ kind: "investor", investorId: "inv-1" });
    expect(await service.verify(token)).toEqual({ kind: "investor", investorId: "inv-1" });
  });

  it("rejects_a_token_signed_with_a_different_secret", async () => {
    const token = await new JwtTokenService("secret-a").issue({
      kind: "officer",
      officerId: "officer-1",
    });
    expect(await new JwtTokenService("secret-b").verify(token)).toBeUndefined();
  });

  it("rejects_garbage_tokens", async () => {
    const service = new JwtTokenService("test-secret");
    expect(await service.verify("not.a.jwt")).toBeUndefined();
  });
});
