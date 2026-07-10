import { EmailAddress } from "../../domain/identity/email-address.js";
import { Investor } from "../../domain/identity/investor.js";
import { EmailAlreadyRegisteredError } from "./errors.js";
import type { IdGenerator, InvestorRepository } from "./ports.js";

export class RegisterInvestor {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { email: string }): Promise<{ investorId: string }> {
    const email = EmailAddress.of(input.email);
    if (await this.investors.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }
    const investor = Investor.register(this.ids.nextId(), email);
    await this.investors.save(investor);
    return { investorId: investor.id };
  }
}
