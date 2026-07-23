import { describe, expect, it } from "vitest";
import { LoginThrottleService } from "../../../src/application/identity/login-throttle-service.js";
import {
  AccountLockedError,
  InvalidCredentialsError,
} from "../../../src/application/identity/errors.js";
import { LoginThrottle } from "../../../src/domain/identity/login-throttle.js";
import type { LoginAttemptStore } from "../../../src/application/identity/ports.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const CONFIG = { maxFailures: 3, windowSeconds: 900, lockoutSeconds: 900 };

class InMemoryAttemptStore implements LoginAttemptStore {
  readonly saved = new Map<string, LoginThrottle>();
  load(key: string): Promise<LoginThrottle> {
    return Promise.resolve(this.saved.get(key) ?? LoginThrottle.empty());
  }
  save(key: string, throttle: LoginThrottle): Promise<void> {
    this.saved.set(key, throttle);
    return Promise.resolve();
  }
}

const setup = () => {
  const store = new InMemoryAttemptStore();
  const clock = new FixedClock(new Date("2026-07-23T10:00:00.000Z"));
  const service = new LoginThrottleService(store, clock, CONFIG);
  return { store, clock, service };
};

describe("LoginThrottleService", () => {
  it("returns_the_result_and_clears_failures_on_success", async () => {
    const s = setup();
    const result = await s.service.guard("a@x.com", () => Promise.resolve("token"));
    expect(result).toBe("token");
    expect((await s.store.load("a@x.com")).failures).toBe(0);
  });

  it("records_a_failure_and_re_throws_invalid_credentials", async () => {
    const s = setup();
    await expect(
      s.service.guard("a@x.com", () => Promise.reject(new InvalidCredentialsError())),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect((await s.store.load("a@x.com")).failures).toBe(1);
  });

  it("locks_after_the_threshold_and_then_blocks_with_AccountLockedError", async () => {
    const s = setup();
    const badLogin = () =>
      s.service.guard("a@x.com", () => Promise.reject(new InvalidCredentialsError()));
    await expect(badLogin()).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(badLogin()).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(badLogin()).rejects.toBeInstanceOf(InvalidCredentialsError); // 3rd trips the lock

    // A 4th attempt is blocked before the credential check even runs.
    let attempted = false;
    await expect(
      s.service.guard("a@x.com", () => {
        attempted = true;
        return Promise.resolve("token");
      }),
    ).rejects.toMatchObject({
      constructor: AccountLockedError,
      retryAfterSeconds: 900,
    });
    expect(attempted).toBe(false);
  });

  it("normalizes_the_key_case_insensitively", async () => {
    const s = setup();
    await s.service
      .guard("Alice@X.com", () => Promise.reject(new InvalidCredentialsError()))
      .catch(() => undefined);
    expect((await s.store.load("alice@x.com")).failures).toBe(1);
  });

  it("does_not_record_a_failure_for_non_credential_errors", async () => {
    const s = setup();
    await expect(
      s.service.guard("a@x.com", () => Promise.reject(new Error("db down"))),
    ).rejects.toThrow("db down");
    expect((await s.store.load("a@x.com")).failures).toBe(0);
  });

  it("recovers_after_the_lock_expires", async () => {
    const s = setup();
    const bad = () =>
      s.service.guard("a@x.com", () => Promise.reject(new InvalidCredentialsError()));
    await bad().catch(() => undefined);
    await bad().catch(() => undefined);
    await bad().catch(() => undefined);

    s.clock.current = new Date("2026-07-23T10:20:00.000Z"); // past the 900s lock
    const result = await s.service.guard("a@x.com", () => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });
});
