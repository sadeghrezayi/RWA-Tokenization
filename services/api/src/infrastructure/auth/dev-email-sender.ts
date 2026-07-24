import { Logger } from "@nestjs/common";
import type { EmailSender } from "../../application/identity/ports.js";

// OD-7: the real SMTP adapter (nodemailer) is deferred to deployment. This dev
// stand-in does NOT send mail — it logs the reset link so it is recoverable
// locally. Clearly labeled [DEV EMAIL — NOT DELIVERED] so it is never mistaken
// for a real send. The web base URL is configurable for link construction.
export class DevEmailSender implements EmailSender {
  private readonly log = new Logger(DevEmailSender.name);
  private readonly webBaseUrl: string;

  constructor(webBaseUrl?: string) {
    this.webBaseUrl = webBaseUrl ?? process.env.WEB_BASE_URL ?? "http://localhost:3000";
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.webBaseUrl}/en/reset-password?token=${encodeURIComponent(token)}`;
    this.log.warn(`[DEV EMAIL — NOT DELIVERED] password reset for ${to}: ${link}`);
    return Promise.resolve();
  }

  sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.webBaseUrl}/en/verify-email?token=${encodeURIComponent(token)}`;
    this.log.warn(`[DEV EMAIL — NOT DELIVERED] email verification for ${to}: ${link}`);
    return Promise.resolve();
  }
}
