import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "../../src/infrastructure/auth/rate-limiter.js";

// Edge protection: at most N hits per key per fixed window. Deterministic with
// an injected clock.
describe("InMemoryRateLimiter", () => {
  const config = { max: 3, windowSeconds: 60 };
  let clockMs = 0;
  const clock = () => new Date(clockMs);
  const make = () => {
    clockMs = 1_000_000;
    return new InMemoryRateLimiter(config, clock);
  };

  it("allows_up_to_the_limit_then_blocks", () => {
    const limiter = make();
    expect(limiter.hit("ip-1").allowed).toBe(true);
    expect(limiter.hit("ip-1").allowed).toBe(true);
    expect(limiter.hit("ip-1").allowed).toBe(true);
    const blocked = limiter.hit("ip-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps_keys_independent", () => {
    const limiter = make();
    limiter.hit("ip-1");
    limiter.hit("ip-1");
    limiter.hit("ip-1");
    expect(limiter.hit("ip-1").allowed).toBe(false);
    expect(limiter.hit("ip-2").allowed).toBe(true);
  });

  it("resets_after_the_window_elapses", () => {
    const limiter = make();
    limiter.hit("ip-1");
    limiter.hit("ip-1");
    limiter.hit("ip-1");
    expect(limiter.hit("ip-1").allowed).toBe(false);
    clockMs += 61_000;
    expect(limiter.hit("ip-1").allowed).toBe(true);
  });
});

// P1-7: the counter map held every key it had ever seen, forever. A scanner
// rotating source addresses — or simply a long-lived process serving many
// clients — grows it without bound until the process dies. Nothing evicted,
// because a fixed-window bucket has no natural end.
describe("InMemoryRateLimiter memory", () => {
  const config = { max: 3, windowSeconds: 60 };
  let clockMs = 1_000_000;
  const clock = () => new Date(clockMs);

  it("forgets keys whose window has long expired", () => {
    const limiter = new InMemoryRateLimiter(config, clock);

    for (let i = 0; i < 500; i++) {
      limiter.hit(`ip-${String(i)}`);
    }
    expect(limiter.size()).toBe(500);

    // Far past every window.
    clockMs += config.windowSeconds * 1000 * 10;
    limiter.hit("someone-new");

    // The 500 stale buckets are gone; only the live one remains.
    expect(limiter.size()).toBe(1);
  });

  it("never forgets a key whose window is still open, even when a sweep runs", () => {
    // Eviction must not become a way to reset a limit early — that would hand
    // an attacker an unlimited budget by making noise from other addresses.
    //
    // The timings matter: the sweep only runs once per window, so this has to
    // arrange for one to fire WHILE the attacker's window is still open.
    // An earlier version of this test made its noise one second apart, so no
    // sweep ever ran and the assertion proved nothing — it passed even when
    // eviction deleted every bucket unconditionally.
    const limiter = new InMemoryRateLimiter(config, clock);
    const windowMs = config.windowSeconds * 1000;

    clockMs = 0;
    limiter.hit("warmup"); // sets the sweep clock to 0

    clockMs = windowMs + 1000; // 61s — the next hit sweeps
    limiter.hit("trigger-a-sweep");

    clockMs += 500; // 61.5s — attacker's window opens just after that sweep
    limiter.hit("attacker");
    limiter.hit("attacker");
    limiter.hit("attacker");

    // 121s: a sweep is due again, but the attacker's window (opened at 61.5s)
    // has 59.5s on the clock and must survive it.
    clockMs = windowMs * 2 + 1000;
    limiter.hit("noise");

    expect(limiter.hit("attacker").allowed).toBe(false);
  });
});
