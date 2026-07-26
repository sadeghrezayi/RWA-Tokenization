import { EmailAddress } from "../../domain/identity/email-address.js";
import type { Clock } from "../offerings/ports.js";
import { EMAIL_OUTBOX_TYPES } from "./email-outbox.js";
import type { EmailGrantCommit, InvestorRepository, TokenGenerator } from "./ports.js";
import { hashResetToken } from "./reset-token.js";

// A reset link is valid for one hour. Short enough to bound exposure, long
// enough to survive a distracted user checking email.
export const RESET_TOKEN_TTL_SECONDS = 3600;

// FR-ID / T4: self-service password reset — request half. Deliberately does NOT
// reveal whether the email is registered (no account enumeration): a malformed
// or unknown address returns the same empty result as a real one. The token
// grant and its delivery email are committed ATOMICALLY (1.6b transactional
// outbox); the email is delivered durably (at-least-once) by the drainer.
export class RequestPasswordReset {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly commit: EmailGrantCommit,
    private readonly generator: TokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { email: string }): Promise<void> {
    let address: EmailAddress;
    try {
      address = EmailAddress.of(input.email);
    } catch {
      return; // malformed input behaves exactly like "unknown account"
    }

    const investor = await this.investors.findByEmail(address);
    if (!investor) {
      return; // no such account — stay silent
    }

    const raw = this.generator.generate();
    const now = this.clock.now();
    await this.commit.commit(
      {
        tokenHash: hashResetToken(raw),
        investorId: investor.id,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_SECONDS * 1000),
      },
      { type: EMAIL_OUTBOX_TYPES.passwordReset, payload: { to: investor.email.value, token: raw } },
    );
  }
}
