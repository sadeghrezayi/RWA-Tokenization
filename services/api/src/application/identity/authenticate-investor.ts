import { EmailAddress } from "../../domain/identity/email-address.js";
import { InvalidCredentialsError } from "./errors.js";
import type { InvestorRepository, PasswordHasher, TokenIssuer } from "./ports.js";

export class AuthenticateInvestor {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<{ token: string; investorId: string }> {
    let email: EmailAddress;
    try {
      email = EmailAddress.of(input.email);
    } catch {
      // A malformed email is just bad credentials at the login boundary.
      throw new InvalidCredentialsError();
    }

    const investor = await this.investors.findByEmail(email);
    if (!investor || !(await this.hasher.verify(input.password, investor.passwordHash.value))) {
      throw new InvalidCredentialsError();
    }

    const token = await this.tokens.issue({ kind: "investor", investorId: investor.id });
    return { token, investorId: investor.id };
  }
}
