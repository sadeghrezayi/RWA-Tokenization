import { describe, expect, it } from "vitest";
import { AuthenticateInvestor } from "../../../src/application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "../../../src/application/identity/authenticate-officer.js";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { InvalidCredentialsError } from "../../../src/application/identity/errors.js";
import {
  FakeMfaChallengeIssuer,
  FakePasswordHasher,
  InMemoryInvestorRepository,
  InMemoryMfaStore,
  RecordingTokenIssuer,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new RecordingTokenIssuer();
  const mfaStore = new InMemoryMfaStore();
  const register = new RegisterInvestor(investors, new SequentialIdGenerator(), hasher);
  const { investorId } = await register.execute({
    email: "investor@example.com",
    password: "s3cure-pass",
  });
  return {
    investorId,
    tokens,
    mfaStore,
    authInvestor: new AuthenticateInvestor(investors, hasher, tokens),
    authOfficer: new AuthenticateOfficer(
      hasher,
      tokens,
      { email: "officer@platform.local", passwordHash: "hashed:0fficer-pass" },
      mfaStore,
      new FakeMfaChallengeIssuer(),
    ),
  };
};

describe("AuthenticateInvestor", () => {
  it("issues_a_token_for_valid_credentials", async () => {
    const { investorId, tokens, authInvestor } = await setup();

    const result = await authInvestor.execute({
      email: "Investor@example.com",
      password: "s3cure-pass",
    });

    expect(result).toEqual({ token: `token:investor:${investorId}`, investorId });
    expect(tokens.issued).toEqual([{ kind: "investor", investorId }]);
  });

  it.each([
    { email: "unknown@example.com", password: "s3cure-pass" },
    { email: "investor@example.com", password: "wrong-pass1" },
    { email: "not-an-email", password: "s3cure-pass" },
  ])("rejects_bad_credentials_with_a_single_error_%#", async (attempt) => {
    const { authInvestor } = await setup();
    await expect(authInvestor.execute(attempt)).rejects.toThrow(InvalidCredentialsError);
  });
});

describe("AuthenticateOfficer", () => {
  it("authenticates_the_configured_officer_when_mfa_is_off", async () => {
    const { authOfficer } = await setup();

    const result = await authOfficer.execute({
      email: "Officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result).toEqual({ status: "authenticated", token: "token:officer:officer-1" });
  });

  it("requires_mfa_when_the_officer_has_an_active_enrollment", async () => {
    const { authOfficer, mfaStore } = await setup();
    await mfaStore.save("officer-1", { secret: "S", status: "active", recoveryCodeHashes: [] });

    const result = await authOfficer.execute({
      email: "officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result).toEqual({ status: "mfa_required", challengeToken: "challenge:officer-1" });
  });

  it("does_not_require_mfa_while_enrollment_is_only_pending", async () => {
    const { authOfficer, mfaStore } = await setup();
    await mfaStore.save("officer-1", { secret: "S", status: "pending", recoveryCodeHashes: [] });

    const result = await authOfficer.execute({
      email: "officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result.status).toBe("authenticated");
  });

  it.each([
    { email: "officer@platform.local", password: "wrong" },
    { email: "other@platform.local", password: "0fficer-pass" },
  ])("rejects_bad_officer_credentials_%#", async (attempt) => {
    const { authOfficer } = await setup();
    await expect(authOfficer.execute(attempt)).rejects.toThrow(InvalidCredentialsError);
  });
});
