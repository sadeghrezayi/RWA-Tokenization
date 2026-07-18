import { EmailAddress } from "../../domain/identity/email-address.js";
import { InvestorNotFoundError } from "./errors.js";
import type { InvestorRepository } from "./ports.js";

// P2: people address each other by email, never by UUID — the transfer UI
// sends an email and this resolves it to the platform investor id.
export class ResolveInvestorByEmail {
  constructor(private readonly investors: InvestorRepository) {}

  async execute(input: { email: string }): Promise<{ investorId: string }> {
    const investor = await this.investors.findByEmail(EmailAddress.of(input.email));
    if (!investor) {
      throw new InvestorNotFoundError(input.email);
    }
    return { investorId: investor.id };
  }
}
