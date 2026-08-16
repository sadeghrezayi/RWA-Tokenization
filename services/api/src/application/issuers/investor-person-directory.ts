import { EmailAddress } from "../../domain/identity/email-address.js";
import type { InvestorRepository } from "../identity/ports.js";
import type { PersonDirectory } from "./ports.js";

// An issuer's people are platform users, and today a platform user is an
// investor record — the same account that completed individual verification.
// Composed over the investor repository rather than reading the table itself,
// so it cannot drift from how a person is loaded anywhere else.
export class InvestorPersonDirectory implements PersonDirectory {
  constructor(private readonly investors: InvestorRepository) {}

  async findIdByEmail(email: string): Promise<string | undefined> {
    // EmailAddress is what normalizes the address everywhere else; using it
    // here is why an invitation works however the sender typed it.
    const investor = await this.investors.findByEmail(EmailAddress.of(email));
    return investor?.id;
  }

  async emailOf(userId: string): Promise<string | undefined> {
    const investor = await this.investors.findById(userId);
    return investor?.email.value;
  }
}
