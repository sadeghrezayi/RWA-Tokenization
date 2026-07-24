import type { Clock } from "../offerings/ports.js";
import { InvalidVerificationTokenError, InvestorNotFoundError } from "./errors.js";
import type { EmailVerificationTokenStore, InvestorRepository } from "./ports.js";
import { hashToken } from "./token-hash.js";

// T4 email-verification — redemption half. Consumes a valid single-use token
// and flips the investor's email to verified.
export class VerifyEmail {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly tokens: EmailVerificationTokenStore,
    private readonly clock: Clock,
  ) {}

  async execute(input: { token: string }): Promise<void> {
    const now = this.clock.now();
    const tokenHash = hashToken(input.token);
    const grant = await this.tokens.findValid(tokenHash, now);
    if (!grant) {
      throw new InvalidVerificationTokenError();
    }

    const investor = await this.investors.findById(grant.investorId);
    if (!investor) {
      throw new InvestorNotFoundError(grant.investorId);
    }

    await this.investors.save(investor.verifyEmail());

    // Burn this token, then invalidate any other outstanding grant.
    await this.tokens.markUsed(tokenHash, now);
    await this.tokens.invalidateForInvestor(grant.investorId, now);
  }
}
