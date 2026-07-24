import { describe, expect, it } from "vitest";
import { CompleteOfficerMfaChallenge } from "../../../src/application/identity/complete-officer-mfa-challenge.js";
import {
  InvalidMfaChallengeError,
  InvalidMfaCodeError,
} from "../../../src/application/identity/errors.js";
import { hashToken } from "../../../src/application/identity/token-hash.js";
import type { TotpService } from "../../../src/application/identity/ports.js";
import {
  FakeMfaChallengeIssuer,
  InMemoryMfaStore,
  RecordingTokenIssuer,
} from "../../fakes/identity-fakes.js";

const OFFICER = "officer-1";
const GOOD_CODE = "123456";

class FakeTotpService implements TotpService {
  generateSecret(): string {
    return "SECRET-XYZ";
  }
  keyUri(secret: string, accountName: string): string {
    return `otpauth://totp/${accountName}?secret=${secret}`;
  }
  verify(secret: string, code: string): Promise<boolean> {
    return Promise.resolve(secret === "SECRET-XYZ" && code === GOOD_CODE);
  }
}

const setup = async () => {
  const store = new InMemoryMfaStore();
  const tokens = new RecordingTokenIssuer();
  await store.save(OFFICER, {
    secret: "SECRET-XYZ",
    status: "active",
    recoveryCodeHashes: ["recovery-1", "recovery-2"].map(hashToken),
  });
  return {
    store,
    tokens,
    complete: new CompleteOfficerMfaChallenge(
      new FakeMfaChallengeIssuer(),
      store,
      new FakeTotpService(),
      tokens,
    ),
  };
};

describe("CompleteOfficerMfaChallenge", () => {
  it("issues_a_session_for_a_valid_challenge_and_totp_code", async () => {
    const s = await setup();
    const result = await s.complete.execute({
      challengeToken: `challenge:${OFFICER}`,
      code: GOOD_CODE,
    });
    expect(result).toEqual({ token: "token:officer:officer-1" });
    expect(s.tokens.issued).toEqual([{ kind: "officer", officerId: OFFICER }]);
  });

  it("accepts_a_single_use_recovery_code_and_consumes_it", async () => {
    const s = await setup();
    const first = await s.complete.execute({
      challengeToken: `challenge:${OFFICER}`,
      code: "recovery-1",
    });
    expect(first.token).toBe("token:officer:officer-1");
    // The code is now spent — a second attempt with it fails.
    await expect(
      s.complete.execute({ challengeToken: `challenge:${OFFICER}`, code: "recovery-1" }),
    ).rejects.toThrow(InvalidMfaCodeError);
    // The other recovery code still works.
    const other = await s.complete.execute({
      challengeToken: `challenge:${OFFICER}`,
      code: "recovery-2",
    });
    expect(other.token).toBe("token:officer:officer-1");
  });

  it("rejects_a_wrong_code", async () => {
    const s = await setup();
    await expect(
      s.complete.execute({ challengeToken: `challenge:${OFFICER}`, code: "000000" }),
    ).rejects.toThrow(InvalidMfaCodeError);
  });

  it("rejects_an_invalid_challenge_token", async () => {
    const s = await setup();
    await expect(
      s.complete.execute({ challengeToken: "not-a-challenge", code: GOOD_CODE }),
    ).rejects.toThrow(InvalidMfaChallengeError);
  });

  it("rejects_a_valid_challenge_when_mfa_is_no_longer_active", async () => {
    const s = await setup();
    await s.store.delete(OFFICER);
    await expect(
      s.complete.execute({ challengeToken: `challenge:${OFFICER}`, code: GOOD_CODE }),
    ).rejects.toThrow(InvalidMfaChallengeError);
  });
});
