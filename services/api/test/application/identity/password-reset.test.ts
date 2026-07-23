import { describe, expect, it } from "vitest";
import { RequestPasswordReset } from "../../../src/application/identity/request-password-reset.js";
import { ResetPassword } from "../../../src/application/identity/reset-password.js";
import { hashResetToken } from "../../../src/application/identity/reset-token.js";
import {
  InvalidResetTokenError,
  WeakPasswordError,
} from "../../../src/application/identity/errors.js";
import type {
  EmailSender,
  PasswordResetTokenRecord,
  PasswordResetTokenStore,
  TokenGenerator,
} from "../../../src/application/identity/ports.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const NOW = new Date("2026-07-24T10:00:00Z");

class FakeTokenGenerator implements TokenGenerator {
  constructor(private readonly value = "raw-token-abc") {}
  generate(): string {
    return this.value;
  }
}

class InMemoryResetTokenStore implements PasswordResetTokenStore {
  readonly rows: PasswordResetTokenRecord[] = [];
  save(record: PasswordResetTokenRecord): Promise<void> {
    this.rows.push({ ...record });
    return Promise.resolve();
  }
  findValid(tokenHash: string, now: Date): Promise<PasswordResetTokenRecord | undefined> {
    return Promise.resolve(
      this.rows.find(
        (r) => r.tokenHash === tokenHash && r.usedAt === undefined && r.expiresAt > now,
      ),
    );
  }
  markUsed(tokenHash: string, at: Date): Promise<void> {
    for (const r of this.rows) {
      if (r.tokenHash === tokenHash) r.usedAt = at;
    }
    return Promise.resolve();
  }
  invalidateForInvestor(investorId: string, at: Date): Promise<void> {
    for (const r of this.rows) {
      if (r.investorId === investorId && r.usedAt === undefined) r.usedAt = at;
    }
    return Promise.resolve();
  }
}

class RecordingEmailSender implements EmailSender {
  readonly sent: { to: string; kind: string; token: string }[] = [];
  sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ to, kind: "password_reset", token });
    return Promise.resolve();
  }
  sendEmailVerification(to: string, token: string): Promise<void> {
    this.sent.push({ to, kind: "email_verification", token });
    return Promise.resolve();
  }
}

// A hasher that records new hashes so we can assert the password changed.
class RecordingHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }
  verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}

const investor = () =>
  Investor.restore(
    "inv-1",
    EmailAddress.of("sara@demo.com"),
    PasswordHash.of("hashed:old-password"),
    KycStatus.restore("approved"),
  );

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  await investors.save(investor());
  const store = new InMemoryResetTokenStore();
  const email = new RecordingEmailSender();
  const hasher = new RecordingHasher();
  const clock = new FixedClock(NOW);
  return {
    investors,
    store,
    email,
    hasher,
    clock,
    request: new RequestPasswordReset(investors, store, email, new FakeTokenGenerator(), clock),
    reset: new ResetPassword(investors, store, hasher, clock),
  };
};

describe("RequestPasswordReset", () => {
  it("stores_the_hashed_token_and_emails_the_raw_token", async () => {
    const s = await setup();

    await s.request.execute({ email: "sara@demo.com" });

    expect(s.store.rows).toHaveLength(1);
    expect(s.store.rows[0]?.tokenHash).toBe(hashResetToken("raw-token-abc"));
    expect(s.store.rows[0]?.tokenHash).not.toBe("raw-token-abc"); // never plaintext
    expect(s.store.rows[0]?.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(s.email.sent).toEqual([
      { to: "sara@demo.com", kind: "password_reset", token: "raw-token-abc" },
    ]);
  });

  it("silently_no_ops_for_an_unknown_email_no_enumeration", async () => {
    const s = await setup();
    await s.request.execute({ email: "ghost@demo.com" });
    expect(s.store.rows).toHaveLength(0);
    expect(s.email.sent).toHaveLength(0);
  });
});

describe("ResetPassword", () => {
  const requested = async (s: Awaited<ReturnType<typeof setup>>) => {
    await s.request.execute({ email: "sara@demo.com" });
    return "raw-token-abc";
  };

  it("sets_the_new_password_and_consumes_the_token", async () => {
    const s = await setup();
    const token = await requested(s);

    await s.reset.execute({ token, password: "brand-new-pw" });

    const updated = await s.investors.findById("inv-1");
    expect(updated).toBeDefined();
    expect(await s.hasher.verify("brand-new-pw", updated?.passwordHash.value ?? "")).toBe(true);
    expect(s.store.rows[0]?.usedAt).toEqual(NOW);
  });

  it("rejects_a_reused_token", async () => {
    const s = await setup();
    const token = await requested(s);
    await s.reset.execute({ token, password: "brand-new-pw" });

    await expect(s.reset.execute({ token, password: "another-pw-1" })).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it("rejects_an_expired_token", async () => {
    const s = await setup();
    const token = await requested(s);
    s.clock.current = new Date("2026-07-24T12:00:01Z"); // past the 1h window

    await expect(s.reset.execute({ token, password: "brand-new-pw" })).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it("rejects_an_unknown_token", async () => {
    const s = await setup();
    await expect(s.reset.execute({ token: "nope", password: "brand-new-pw" })).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it("enforces_the_password_policy", async () => {
    const s = await setup();
    const token = await requested(s);
    await expect(s.reset.execute({ token, password: "short" })).rejects.toThrow(WeakPasswordError);
  });
});
