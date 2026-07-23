// Edge rate limiter: fixed-window counter per key, held in memory. Adequate
// for the single-node pilot; a distributed store (Redis) is the production
// upgrade (documented). The clock is injectable for deterministic tests.
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

  constructor(
    private readonly config: RateLimitConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  hit(key: string): RateLimitResult {
    const nowMs = this.clock().getTime();
    const windowMs = this.config.windowSeconds * 1000;
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
}
