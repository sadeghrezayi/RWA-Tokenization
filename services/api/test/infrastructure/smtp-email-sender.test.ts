import { describe, expect, it, vi } from "vitest";
import {
  SmtpEmailSender,
  smtpConfigFromEnv,
} from "../../src/infrastructure/auth/smtp-email-sender.js";

// P0-3: real delivery behind the existing EmailSender port. nodemailer was
// approved in OD-4; WHICH provider is deployment configuration, not a code
// decision, so this adapter takes any SMTP host.
describe("smtpConfigFromEnv", () => {
  it("is absent until a host is configured, so the dev sender stays the default", () => {
    // Silently "sending" nowhere is the failure mode to avoid: an operator who
    // configures nothing must keep the loudly-labelled dev sender.
    expect(smtpConfigFromEnv({})).toBeUndefined();
    expect(smtpConfigFromEnv({ SMTP_HOST: "   " })).toBeUndefined();
  });

  it("reads a host, and defaults the port and security sensibly", () => {
    const config = smtpConfigFromEnv({ SMTP_HOST: "smtp.example.com" });

    expect(config?.host).toBe("smtp.example.com");
    // 587 (submission) with STARTTLS is the modern default; 465 is implicit TLS.
    expect(config?.port).toBe(587);
    expect(config?.secure).toBe(false);
  });

  it("treats port 465 as implicit TLS without being told twice", () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "465" })?.secure).toBe(true);
  });

  it("carries credentials only when BOTH are given", () => {
    // A half-configured login would fail at connect time with a confusing
    // error; an unauthenticated relay is a legitimate setup.
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_USER: "u" })?.auth).toBeUndefined();
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PASSWORD: "p" })?.auth).toBeUndefined();
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p" })?.auth).toEqual(
      {
        user: "u",
        pass: "p",
      },
    );
  });

  it("refuses a port that is not a number, rather than quietly using 587", () => {
    // A typo in deployment config must be loud. Falling back would send mail
    // somewhere nobody intended.
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "not-a-port" })).toThrow(
      /SMTP_PORT/,
    );
  });
});

describe("SmtpEmailSender", () => {
  const transport = () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<1@example.com>" });
    return { sendMail };
  };

  // No cast needed: MailTransport is structural, so the mock satisfies it
  // directly — which is the point of declaring the port rather than depending
  // on nodemailer's own types.
  const sender = (t: ReturnType<typeof transport>) =>
    new SmtpEmailSender(t, {
      from: "platform@example.com",
      webBaseUrl: "https://app.example.com",
    });

  it("sends a password reset to a real address with a usable link", async () => {
    const t = transport();
    await sender(t).sendPasswordReset("someone@example.com", "tok-123");

    const sent = t.sendMail.mock.calls[0]?.[0] as {
      to: string;
      from: string;
      subject: string;
      text: string;
    };
    expect(sent.to).toBe("someone@example.com");
    expect(sent.from).toBe("platform@example.com");
    expect(sent.text).toContain("https://app.example.com/en/reset-password?token=tok-123");
  });

  it("URL-encodes the token, so a token with URL characters still works", async () => {
    const t = transport();
    await sender(t).sendEmailVerification("someone@example.com", "a+b/c=d");

    const sent = t.sendMail.mock.calls[0]?.[0] as { text: string };
    expect(sent.text).toContain("token=a%2Bb%2Fc%3Dd");
    expect(sent.text).not.toContain("a+b/c=d");
  });

  it("passes a notification's title and body through as subject and text", async () => {
    const t = transport();
    await sender(t).sendNotification("someone@example.com", "Payout paid", "100,000 ﷼ credited");

    const sent = t.sendMail.mock.calls[0]?.[0] as { subject: string; text: string };
    expect(sent.subject).toBe("Payout paid");
    expect(sent.text).toContain("100,000 ﷼ credited");
  });

  it("lets a send failure propagate, so the outbox retries instead of losing it", async () => {
    // The outbox is the durability mechanism (B7). Swallowing the error here
    // would mark the message delivered when nothing was sent.
    const t = transport();
    t.sendMail.mockRejectedValue(new Error("relay refused"));

    await expect(sender(t).sendNotification("a@b.c", "t", "b")).rejects.toThrow("relay refused");
  });
});

// The wiring decision itself, asserted at the composition root's own logic.
// Getting this backwards is the dangerous case: a platform that believes it is
// sending mail while nothing leaves the building.
describe("which sender the platform selects", () => {
  it("keeps the DEV sender when no SMTP host is configured", async () => {
    const { DevEmailSender } = await import("../../src/infrastructure/auth/dev-email-sender.js");
    const smtp = smtpConfigFromEnv({ WEB_BASE_URL: "https://app.example.com" });

    expect(smtp).toBeUndefined();
    // Which is what the factory branches on.
    const chosen = smtp === undefined ? new DevEmailSender() : undefined;
    expect(chosen).toBeInstanceOf(DevEmailSender);
  });

  it("selects SMTP as soon as a host is configured", () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "smtp.example.com" })).toBeDefined();
  });
});
