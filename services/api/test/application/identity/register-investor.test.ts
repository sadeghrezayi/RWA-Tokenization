import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import {
  EmailAlreadyRegisteredError,
  WeakPasswordError,
} from "../../../src/application/identity/errors.js";
import { InvalidEmailError } from "../../../src/domain/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

const setup = () => {
  const investors = new InMemoryInvestorRepository();
  const useCase = new RegisterInvestor(
    investors,
    new SequentialIdGenerator(),
    new FakePasswordHasher(),
  );
  return { investors, useCase };
};

const VALID = { email: "investor@example.com", password: "s3cure-pass" };

describe("RegisterInvestor", () => {
  it("persists_a_new_investor_with_draft_kyc_and_hashed_password", async () => {
    const { investors, useCase } = setup();

    const { investorId } = await useCase.execute(VALID);

    const stored = await investors.findById(investorId);
    expect(stored?.email.value).toBe("investor@example.com");
    expect(stored?.kycStatus.state).toBe("draft");
    expect(stored?.passwordHash.value).toBe("hashed:s3cure-pass");
  });

  it("rejects_a_duplicate_email_case_insensitively", async () => {
    const { useCase } = setup();
    await useCase.execute(VALID);

    await expect(
      useCase.execute({ email: "INVESTOR@example.com", password: "s3cure-pass" }),
    ).rejects.toThrow(EmailAlreadyRegisteredError);
  });

  it("rejects_a_short_password_without_persisting", async () => {
    const { investors, useCase } = setup();

    await expect(
      useCase.execute({ email: "investor@example.com", password: "short7c" }),
    ).rejects.toThrow(WeakPasswordError);
    expect(await investors.findById("inv-1")).toBeUndefined();
  });

  it("rejects_a_malformed_email_without_persisting", async () => {
    const { investors, useCase } = setup();

    await expect(
      useCase.execute({ email: "not-an-email", password: "s3cure-pass" }),
    ).rejects.toThrow(InvalidEmailError);
    expect(await investors.findById("inv-1")).toBeUndefined();
  });
});
