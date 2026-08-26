import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { EmailSender } from "../../application/identity/ports.js";

// The slice of nodemailer's transport this adapter uses. Declared here rather
// than imported so the unit tests can drive it without a live SMTP server, and
// so nothing else in the codebase depends on nodemailer's types.
export interface MailTransport {
  sendMail(message: { to: string; from: string; subject: string; text: string }): Promise<unknown>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

// P0-3 / OD-7: WHICH provider is deployment configuration, not a code decision,
// so this reads any SMTP host. Absent config means absent adapter — the caller
// keeps the loudly-labelled dev sender rather than silently sending nowhere.
export const smtpConfigFromEnv = (
  env: Record<string, string | undefined>,
): SmtpConfig | undefined => {
  const host = env.SMTP_HOST?.trim();
  if (host === undefined || host === "") {
    return undefined;
  }
  const rawPort = env.SMTP_PORT?.trim();
  let port = 587;
  if (rawPort !== undefined && rawPort !== "") {
    port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) {
      // A typo must be loud. Falling back to 587 would send mail through a
      // host and port nobody intended.
      throw new Error(`SMTP_PORT must be a positive integer, got "${rawPort}"`);
    }
  }
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD?.trim();
  return {
    host,
    port,
    // 465 is implicit TLS; 587 is submission with STARTTLS, which nodemailer
    // negotiates when `secure` is false.
    secure: port === 465,
    // Only when BOTH are present: a half-configured login fails at connect time
    // with an error that does not name the cause, and an unauthenticated relay
    // is a legitimate setup.
    ...(user !== undefined && user !== "" && pass !== undefined && pass !== ""
      ? { auth: { user, pass } }
      : {}),
  };
};

// Real delivery behind the existing EmailSender port.
//
// Failures are NOT swallowed. The outbox is what makes delivery durable
// (decision B7), and it can only retry a message whose send actually threw —
// catching here would mark it delivered when nothing was sent.
// A stable, non-obvious reference for a recipient, so "why did this person get
// four password resets" stays answerable without writing anyone's address into
// the application log. A log that says nothing is its own kind of outage —
// K-39 was six days of silence — so the answer is to anonymise the identifier,
// not to drop it.
//
// PSEUDONYMISATION, NOT ANONYMISATION, and worth stating plainly: anyone
// holding a suspected address can hash it and look for a match. This defeats
// casual disclosure and log scraping; it does not defeat a targeted "was this
// person emailed" question. That is a deliberate trade to keep the log useful.
const recipientReference = (to: string): string =>
  createHash("sha256").update(to.trim().toLowerCase()).digest("hex").slice(0, 12);

export class SmtpEmailSender implements EmailSender {
  private readonly log = new Logger(SmtpEmailSender.name);

  constructor(
    private readonly transport: MailTransport,
    private readonly options: { from: string; webBaseUrl: string },
  ) {}

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.options.webBaseUrl}/en/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(to, "Reset your password", `Open this link to set a new password:\n\n${link}`);
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.options.webBaseUrl}/en/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(to, "Verify your email address", `Confirm your address:\n\n${link}`);
  }

  async sendNotification(to: string, title: string, body: string): Promise<void> {
    await this.send(to, title, body);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({ to, from: this.options.from, subject, text });
    // The recipient is recorded as a REFERENCE, never as an address. The token
    // and body were already left out.
    //
    // The line this replaces reasoned that "the address is already in a log by
    // virtue of being sent to". The mail server's log is a different system
    // with different access: this one is read by developers, shipped to
    // aggregators, and pasted into CI build summaries. Being logged somewhere
    // does not license logging it here.
    this.log.log(`sent "${subject}" to ${recipientReference(to)}`);
  }
}
