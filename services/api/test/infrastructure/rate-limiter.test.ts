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
