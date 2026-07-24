import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { OtplibTotpService } from "../../src/infrastructure/auth/otplib-totp-service.js";

// Exercises the REAL otplib crypto (the unit tests use a fake TotpService).
describe("OtplibTotpService (real TOTP)", () => {
  const service = new OtplibTotpService();

  it("verifies_a_live_code_generated_from_the_secret", async () => {
    const secret = service.generateSecret();
    const code = await generate({ secret });
    expect(await service.verify(secret, code)).toBe(true);
  });

  it("rejects_a_wrong_code", async () => {
    const secret = service.generateSecret();
    expect(await service.verify(secret, "000000")).toBe(false);
  });

  it("builds_a_scannable_otpauth_uri", () => {
    const secret = service.generateSecret();
    const uri = service.keyUri(secret, "officer@platform.local");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent(secret));
    expect(uri).toContain("Asset%20Tokenization%20Platform");
  });
});
