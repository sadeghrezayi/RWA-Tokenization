import { describe, expect, it } from "vitest";
import { AuthenticateInvestor } from "../../../src/application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "../../../src/application/identity/authenticate-officer.js";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { InvalidCredentialsError } from "../../../src/application/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  RecordingTokenIssuer,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new RecordingTokenIssuer();
  const register = new RegisterInvestor(investors, new SequentialIdGenerator(), hasher);
  const { investorId } = await register.execute({
    email: "investor@example.com",
    password: "s3cure-pass",
  });
  return {
    investorId,
    tokens,
    authInvestor: new AuthenticateInvestor(investors, hasher, tokens),
    authOfficer: new AuthenticateOfficer(hasher, tokens, {
      email: "officer@platform.local",
      passwordHash: "hashed:0fficer-pass",
    }),
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
  it("issues_an_officer_token_for_the_configured_officer", async () => {
    const { authOfficer } = await setup();

    const result = await authOfficer.execute({
      email: "Officer@platform.local",
      password: "0fficer-pass",
    });

    expect(result.token).toBe("token:officer:officer-1");
  });

  it.each([
    { email: "officer@platform.local", password: "wrong" },
    { email: "other@platform.local", password: "0fficer-pass" },
  ])("rejects_bad_officer_credentials_%#", async (attempt) => {
    const { authOfficer } = await setup();
    await expect(authOfficer.execute(attempt)).rejects.toThrow(InvalidCredentialsError);
  });
});
