import { EmailAddress } from "../../domain/identity/email-address.js";
import { Investor } from "../../domain/identity/investor.js";
import { PasswordHash } from "../../domain/identity/password-hash.js";
import { EmailAlreadyRegisteredError, WeakPasswordError } from "./errors.js";
import type { IdGenerator, InvestorRepository, PasswordHasher } from "./ports.js";

// Engineering default pending a product password policy: length only, NIST-style.
export const MIN_PASSWORD_LENGTH = 8;

export class RegisterInvestor {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly ids: IdGenerator,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: { email: string; password: string }): Promise<{ investorId: string }> {
    const email = EmailAddress.of(input.email);
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(MIN_PASSWORD_LENGTH);
    }
    if (await this.investors.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }
    const passwordHash = PasswordHash.of(await this.hasher.hash(input.password));
    const investor = Investor.register(this.ids.nextId(), email, passwordHash);
    await this.investors.save(investor);
    return { investorId: investor.id };
  }
}
