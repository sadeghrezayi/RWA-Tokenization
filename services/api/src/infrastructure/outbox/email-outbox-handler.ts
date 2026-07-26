import { EMAIL_OUTBOX_TYPES } from "../../application/identity/email-outbox.js";
import type { EmailSender } from "../../application/identity/ports.js";
import type { OutboxHandler } from "../../application/outbox/ports.js";

// Delivers one queued auth email. The payload carries the recipient and the raw
// single-use token (the email's secret). Shape is validated defensively so a
// malformed message surfaces a clear error and dead-letters after retries,
// rather than throwing something opaque deep in the sender.
export class EmailOutboxHandler implements OutboxHandler {
  constructor(
    readonly type: string,
    private readonly send: (to: string, token: string) => Promise<void>,
  ) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const { to, token } = payload;
    if (typeof to !== "string" || typeof token !== "string") {
      throw new Error(`invalid ${this.type} payload: expected { to, token } as strings`);
    }
    await this.send(to, token);
  }
}

// The two auth-email handlers, wired over an EmailSender.
export const emailOutboxHandlers = (email: EmailSender): OutboxHandler[] => [
  new EmailOutboxHandler(EMAIL_OUTBOX_TYPES.passwordReset, (to, token) =>
    email.sendPasswordReset(to, token),
  ),
  new EmailOutboxHandler(EMAIL_OUTBOX_TYPES.emailVerification, (to, token) =>
    email.sendEmailVerification(to, token),
  ),
];
