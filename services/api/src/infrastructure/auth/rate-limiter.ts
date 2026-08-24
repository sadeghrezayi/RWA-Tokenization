// Edge rate limiter: fixed-window counter per key, held in memory. The clock is
// injectable for deterministic tests.
//
// PER-PROCESS BY DESIGN, and the limitation is bounded rather than alarming:
// brute force against a SPECIFIC account is stopped by `LoginAttemptStore`,
// which is Postgres-backed and therefore shared across instances (T4). This
// limiter is the secondary, per-IP defence against guessing spread across many
// accounts; behind N instances its effective ceiling is N x max. Moving it to a
// shared store is a deployment decision with a real cost — a round trip on every
// auth request, including the session read every page load performs (K-27) —
// and is recorded as P1-7 rather than assumed.
export interface RateLimitConfig {
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStartMs: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  // When the last sweep ran, so the scan is amortised rather than paid on
  // every request (see forgetExpired).
  private lastSweepMs = 0;

  constructor(
    private readonly config: RateLimitConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // Live bucket count. Exists so a test can prove the map does not grow without
  // bound — the defect this class shipped with.
  size(): number {
    return this.buckets.size;
  }

  hit(key: string): RateLimitResult {
    const nowMs = this.clock().getTime();
    const windowMs = this.config.windowSeconds * 1000;
    this.forgetExpired(nowMs, windowMs);
    const bucket = this.buckets.get(key);
    if (bucket === undefined || nowMs - bucket.windowStartMs >= windowMs) {
      this.buckets.set(key, { count: 1, windowStartMs: nowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    if (bucket.count <= this.config.max) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const retryAfterSeconds = Math.ceil((bucket.windowStartMs + windowMs - nowMs) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  // Every key the process had ever seen was kept forever: a fixed-window bucket
  // has no natural end, so nothing removed it. A scanner rotating source
  // addresses grew this map until the process died.
  //
  // Swept at most once per window, not on every request: a scan is O(number of
  // live keys), and paying that per auth call would trade a slow leak for a
  // steady cost on the hot path.
  //
  // Only buckets whose window has CLOSED are dropped. Evicting a live one would
  // hand an attacker a fresh budget simply by making noise from other
  // addresses, which is the opposite of what this class is for.
  private forgetExpired(nowMs: number, windowMs: number): void {
    if (nowMs - this.lastSweepMs < windowMs) {
      return;
    }
    this.lastSweepMs = nowMs;
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.windowStartMs >= windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
