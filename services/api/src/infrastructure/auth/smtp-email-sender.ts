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
    // The address is already in the log by virtue of being sent to; the token
    // and body deliberately are not.
    this.log.log(`sent "${subject}" to ${to}`);
  }
}
