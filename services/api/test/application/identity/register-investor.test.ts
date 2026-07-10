import { describe, expect, it } from "vitest";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { EmailAlreadyRegisteredError } from "../../../src/application/identity/errors.js";
import { InvalidEmailError } from "../../../src/domain/identity/errors.js";
import { InMemoryInvestorRepository, SequentialIdGenerator } from "../../fakes/identity-fakes.js";

const setup = () => {
  const investors = new InMemoryInvestorRepository();
  const useCase = new RegisterInvestor(investors, new SequentialIdGenerator());
  return { investors, useCase };
};

describe("RegisterInvestor", () => {
  it("persists_a_new_investor_with_draft_kyc_and_returns_its_id", async () => {
    const { investors, useCase } = setup();

    const { investorId } = await useCase.execute({ email: "investor@example.com" });

    const stored = await investors.findById(investorId);
    expect(stored?.email.value).toBe("investor@example.com");
    expect(stored?.kycStatus.state).toBe("draft");
  });

  it("rejects_a_duplicate_email_case_insensitively", async () => {
    const { useCase } = setup();
    await useCase.execute({ email: "investor@example.com" });

    await expect(useCase.execute({ email: "INVESTOR@example.com" })).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });

  it("rejects_a_malformed_email_without_persisting", async () => {
    const { investors, useCase } = setup();

    await expect(useCase.execute({ email: "not-an-email" })).rejects.toThrow(InvalidEmailError);
    expect(await investors.findById("inv-1")).toBeUndefined();
  });
});
