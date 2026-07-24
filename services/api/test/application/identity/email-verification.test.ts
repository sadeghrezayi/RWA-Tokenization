import { describe, expect, it } from "vitest";
import { RequestEmailVerification } from "../../../src/application/identity/request-email-verification.js";
import { VerifyEmail } from "../../../src/application/identity/verify-email.js";
import { InvalidVerificationTokenError } from "../../../src/application/identity/errors.js";
import { hashToken } from "../../../src/application/identity/token-hash.js";
import type {
  EmailSender,
  SingleUseTokenRecord,
  SingleUseTokenStore,
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
  constructor(private readonly value = "verify-token-abc") {}
  generate(): string {
    return this.value;
  }
}

class InMemoryTokenStore implements SingleUseTokenStore {
  readonly rows: SingleUseTokenRecord[] = [];
  save(record: SingleUseTokenRecord): Promise<void> {
    this.rows.push({ ...record });
    return Promise.resolve();
  }
  findValid(tokenHash: string, now: Date): Promise<SingleUseTokenRecord | undefined> {
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

const unverified = () =>
  Investor.restore(
    "inv-1",
    EmailAddress.of("sara@demo.com"),
    PasswordHash.of("hashed:pw"),
    KycStatus.restore("approved"),
    false,
  );

const setup = async (seed = unverified()) => {
  const investors = new InMemoryInvestorRepository();
  await investors.save(seed);
  const store = new InMemoryTokenStore();
  const email = new RecordingEmailSender();
  const clock = new FixedClock(NOW);
  return {
    investors,
    store,
    email,
    clock,
    request: new RequestEmailVerification(investors, store, email, new FakeTokenGenerator(), clock),
    verify: new VerifyEmail(investors, store, clock),
  };
};

describe("RequestEmailVerification", () => {
  it("stores_the_hashed_token_and_emails_the_raw_token", async () => {
    const s = await setup();
    await s.request.execute({ email: "sara@demo.com" });

    expect(s.store.rows).toHaveLength(1);
    expect(s.store.rows[0]?.tokenHash).toBe(hashToken("verify-token-abc"));
    expect(s.store.rows[0]?.tokenHash).not.toBe("verify-token-abc");
    expect(s.store.rows[0]?.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(s.email.sent).toEqual([
      { to: "sara@demo.com", kind: "email_verification", token: "verify-token-abc" },
    ]);
  });

  it("silently_no_ops_for_an_unknown_email", async () => {
    const s = await setup();
    await s.request.execute({ email: "ghost@demo.com" });
    expect(s.store.rows).toHaveLength(0);
    expect(s.email.sent).toHaveLength(0);
  });

  it("does_not_re_send_when_the_email_is_already_verified", async () => {
    const s = await setup(unverified().verifyEmail());
    await s.request.execute({ email: "sara@demo.com" });
    expect(s.store.rows).toHaveLength(0);
    expect(s.email.sent).toHaveLength(0);
  });
});

describe("VerifyEmail", () => {
  const requested = async (s: Awaited<ReturnType<typeof setup>>) => {
    await s.request.execute({ email: "sara@demo.com" });
    return "verify-token-abc";
  };

  it("marks_the_email_verified_and_consumes_the_token", async () => {
    const s = await setup();
    const token = await requested(s);

    await s.verify.execute({ token });

    const updated = await s.investors.findById("inv-1");
    expect(updated?.emailVerified).toBe(true);
    expect(s.store.rows[0]?.usedAt).toEqual(NOW);
  });

  it("rejects_a_reused_token", async () => {
    const s = await setup();
    const token = await requested(s);
    await s.verify.execute({ token });
    await expect(s.verify.execute({ token })).rejects.toThrow(InvalidVerificationTokenError);
  });

  it("rejects_an_expired_token", async () => {
    const s = await setup();
    const token = await requested(s);
    s.clock.current = new Date("2026-07-25T10:00:01Z"); // past the 24h window
    await expect(s.verify.execute({ token })).rejects.toThrow(InvalidVerificationTokenError);
  });

  it("rejects_an_unknown_token", async () => {
    const s = await setup();
    await expect(s.verify.execute({ token: "nope" })).rejects.toThrow(
      InvalidVerificationTokenError,
    );
  });
});
