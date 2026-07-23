import { PasswordHash } from "../../domain/identity/password-hash.js";
import type { Clock } from "../offerings/ports.js";
import { InvalidResetTokenError, InvestorNotFoundError, WeakPasswordError } from "./errors.js";
import type { InvestorRepository, PasswordHasher, PasswordResetTokenStore } from "./ports.js";
import { MIN_PASSWORD_LENGTH } from "./register-investor.js";
import { hashResetToken } from "./reset-token.js";

// FR-ID / T4: self-service password reset — redemption half. Validates the
// new password against policy first (cheap, no token leak), then consumes a
// valid single-use token and rotates the credential.
export class ResetPassword {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly tokens: PasswordResetTokenStore,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: { token: string; password: string }): Promise<void> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(MIN_PASSWORD_LENGTH);
    }

    const now = this.clock.now();
    const tokenHash = hashResetToken(input.token);
    const grant = await this.tokens.findValid(tokenHash, now);
    if (!grant) {
      throw new InvalidResetTokenError();
    }

    const investor = await this.investors.findById(grant.investorId);
    if (!investor) {
      // The account vanished between request and reset — treat as invalid.
      throw new InvestorNotFoundError(grant.investorId);
    }

    const newHash = PasswordHash.of(await this.hasher.hash(input.password));
    await this.investors.save(investor.withPasswordHash(newHash));

    // Burn this token, then invalidate any other outstanding grant so a second
    // in-flight link can't be redeemed against the now-changed password.
    await this.tokens.markUsed(tokenHash, now);
    await this.tokens.invalidateForInvestor(grant.investorId, now);
  }
}
