import { describe, expect, it } from "vitest";
import { LoginThrottle } from "../../../src/domain/identity/login-throttle.js";

// T4 mitigation: after N failed logins inside a window an account is locked
// for a cooldown. Pure value object; the clock is injected by the caller.
const CONFIG = { maxFailures: 5, windowSeconds: 900, lockoutSeconds: 900 };
const T = (iso: string) => new Date(iso);
const BASE = "2026-07-23T10:00:00.000Z";

const failNtimes = (n: number, at: Date) => {
  let throttle = LoginThrottle.empty();
  for (let i = 0; i < n; i++) {
    throttle = throttle.recordFailure(at, CONFIG);
  }
  return throttle;
};

describe("LoginThrottle", () => {
  it("starts_unlocked_with_no_failures", () => {
    const throttle = LoginThrottle.empty();
    expect(throttle.isLocked(T(BASE))).toBe(false);
    expect(throttle.retryAfterSeconds(T(BASE))).toBe(0);
  });

  it("stays_unlocked_below_the_failure_threshold", () => {
    const throttle = failNtimes(4, T(BASE));
    expect(throttle.isLocked(T(BASE))).toBe(false);
  });

  it("locks_for_the_cooldown_at_the_failure_threshold", () => {
    const throttle = failNtimes(5, T(BASE));
    expect(throttle.isLocked(T(BASE))).toBe(true);
    // Locked for 900s from the 5th failure.
    expect(throttle.retryAfterSeconds(T("2026-07-23T10:05:00.000Z"))).toBe(600);
  });

  it("unlocks_once_the_cooldown_elapses", () => {
    const throttle = failNtimes(5, T(BASE));
    expect(throttle.isLocked(T("2026-07-23T10:15:01.000Z"))).toBe(false);
    expect(throttle.retryAfterSeconds(T("2026-07-23T10:15:01.000Z"))).toBe(0);
  });

  it("resets_the_counting_window_after_it_expires", () => {
    let throttle = failNtimes(4, T(BASE));
    // A 5th failure well outside the 900s window starts a fresh window (1),
    // so it does not trip the lock.
    throttle = throttle.recordFailure(T("2026-07-23T10:20:00.000Z"), CONFIG);
    expect(throttle.isLocked(T("2026-07-23T10:20:00.000Z"))).toBe(false);
  });

  it("clears_completely_on_a_successful_login", () => {
    const throttle = failNtimes(5, T(BASE)).recordSuccess();
    expect(throttle.isLocked(T(BASE))).toBe(false);
    expect(throttle.failures).toBe(0);
    expect(throttle.lockedUntil).toBeUndefined();
  });

  it("does_not_extend_the_lock_while_already_locked", () => {
    const locked = failNtimes(5, T(BASE));
    const still = locked.recordFailure(T("2026-07-23T10:05:00.000Z"), CONFIG);
    expect(still.lockedUntil?.toISOString()).toBe(locked.lockedUntil?.toISOString());
  });

  it("round_trips_through_restore", () => {
    const locked = failNtimes(5, T(BASE));
    const restored = LoginThrottle.restore({
      failures: locked.failures,
      windowStartedAt: locked.windowStartedAt,
      lockedUntil: locked.lockedUntil,
    });
    expect(restored.isLocked(T(BASE))).toBe(true);
    expect(restored.retryAfterSeconds(T(BASE))).toBe(900);
  });
});
