import { EmailAddress } from "../../domain/identity/email-address.js";
import type { Clock } from "../offerings/ports.js";
import { EMAIL_OUTBOX_TYPES } from "./email-outbox.js";
import type { EmailGrantCommit, InvestorRepository, TokenGenerator } from "./ports.js";
import { hashToken } from "./token-hash.js";

// A verification link is valid for 24h — long enough for an unattended inbox,
// short enough to bound exposure.
export const EMAIL_VERIFICATION_TTL_SECONDS = 86_400;

// T4 email-verification — request half. Sends a link to prove control of the
// address. No-ops silently for an unknown address (no enumeration) and for an
// already-verified account (nothing to prove). The token grant and its delivery
// email are committed ATOMICALLY (1.6b transactional outbox); the email is
// delivered durably (at-least-once) by the drainer.
export class RequestEmailVerification {
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
    if (!investor || investor.emailVerified) {
      return; // no such account, or nothing to verify — stay silent
    }

    const raw = this.generator.generate();
    const now = this.clock.now();
    await this.commit.commit(
      {
        tokenHash: hashToken(raw),
        investorId: investor.id,
        expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
      },
      {
        type: EMAIL_OUTBOX_TYPES.emailVerification,
        payload: { to: investor.email.value, token: raw },
      },
    );
  }
}
