import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { DevEmailSender } from "../../src/infrastructure/auth/dev-email-sender.js";

// The counterpart to the SMTP adapter's "never writes the recipient's address".
//
// This one DOES write the address, and the reset token with it, entirely on
// purpose: it never sends anything, so the log is the only way a developer
// gets the link. That makes it the single place in the platform where PII and
// a credential are written down together — so it is pinned here rather than
// left as an unstated exception, and the label that makes it recognisable is
// asserted alongside it.
//
// It is the default whenever SMTP_HOST is unset, which is exactly why the label
// matters: the way this becomes an incident is nobody noticing it is still on.
const captureWarnings = async (run: () => Promise<void>): Promise<string> => {
  const lines: string[] = [];
  const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation((message: unknown) => {
    lines.push(String(message));
  });
  try {
    await run();
  } finally {
    warn.mockRestore();
  }
  return lines.join("\n");
};

describe("DevEmailSender", () => {
  const sender = () => new DevEmailSender("https://app.example.com");

  it("labels every line so it can never be mistaken for a real send", async () => {
    const output = await captureWarnings(async () => {
      await sender().sendPasswordReset("alice@example.com", "tok-1");
      await sender().sendEmailVerification("alice@example.com", "tok-2");
      await sender().sendNotification("alice@example.com", "Title", "Body");
    });

    const lines = output.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toContain("[DEV EMAIL — NOT DELIVERED]");
    }
  });

  it("prints a usable link, which is the only reason it exists", async () => {
    const output = await captureWarnings(() =>
      sender().sendPasswordReset("alice@example.com", "tok-1"),
    );

    expect(output).toContain("https://app.example.com/en/reset-password?token=tok-1");
  });

  it("writes the address and the token — the exemption, stated deliberately", async () => {
    // Asserted rather than merely tolerated. If this ever stops being true the
    // dev workflow has changed, and if it ever becomes true of the SMTP adapter
    // that is a leak — which is what the sibling suite exists to catch.
    const output = await captureWarnings(() =>
      sender().sendPasswordReset("alice@example.com", "tok-secret"),
    );

    expect(output).toContain("alice@example.com");
    expect(output).toContain("tok-secret");
  });

  it("URL-encodes a token with URL characters, so the printed link works", async () => {
    const output = await captureWarnings(() =>
      sender().sendPasswordReset("alice@example.com", "a+b/c=d"),
    );

    expect(output).toContain("token=a%2Bb%2Fc%3Dd");
  });
});
