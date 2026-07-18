import { describe, expect, it } from "vitest";
import { ResolveInvestorByEmail } from "../../../src/application/identity/resolve-investor-by-email.js";
import { RegisterInvestor } from "../../../src/application/identity/register-investor.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import {
  FakePasswordHasher,
  InMemoryInvestorRepository,
  SequentialIdGenerator,
} from "../../fakes/identity-fakes.js";

describe("ResolveInvestorByEmail", () => {
  it("resolves_case_insensitively", async () => {
    const investors = new InMemoryInvestorRepository();
    const { investorId } = await new RegisterInvestor(
      investors,
      new SequentialIdGenerator(),
      new FakePasswordHasher(),
    ).execute({ email: "bob@demo.com", password: "s3cure-pass" });

    const resolved = await new ResolveInvestorByEmail(investors).execute({
      email: "Bob@Demo.com",
    });
    expect(resolved.investorId).toBe(investorId);
  });

  it("throws_for_an_unknown_email", async () => {
    await expect(
      new ResolveInvestorByEmail(new InMemoryInvestorRepository()).execute({
        email: "ghost@demo.com",
      }),
    ).rejects.toThrow(InvestorNotFoundError);
  });
});
