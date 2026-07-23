import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, AUTH_RATE_LIMITER } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import { InMemoryRateLimiter } from "../../src/infrastructure/auth/rate-limiter.js";

// T4: brute-force protection over the real HTTP stack. The rate limiter is
// overridden with a high cap so the lockout test isn't tripped by the edge
// limiter; a second app exercises the edge limiter directly.
describe("Auth throttle API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const email = `throttle-${randomUUID()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue(new InMemoryRateLimiter({ max: 1000, windowSeconds: 60 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    // A real approved investor so a correct password would otherwise succeed.
    await request(server).post("/investors").send({ email, password: "Correct-Horse-1" });
  }, 30_000);

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
  });

  afterAll(async () => {
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
    await app.close();
  });

  it("locks_the_account_after_five_failed_logins_with_retry_after", async () => {
    for (let i = 0; i < 5; i++) {
      await request(server).post("/auth/login").send({ email, password: "wrong" }).expect(401);
    }
    // 6th attempt is locked out — even the correct password is refused now.
    const locked = await request(server)
      .post("/auth/login")
      .send({ email, password: "Correct-Horse-1" })
      .expect(429);
    expect(locked.headers["retry-after"]).toBeDefined();
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    expect((locked.body as { message: string }).message).toMatch(/too many failed login/i);
  });

  it("stores_lockout_state_persistently_keyed_by_lowercased_email", async () => {
    for (let i = 0; i < 5; i++) {
      await request(server).post("/auth/login").send({ email, password: "wrong" }).expect(401);
    }
    const row = await prisma.loginAttempt.findUnique({ where: { key: email.toLowerCase() } });
    expect(row?.failures).toBe(5);
    expect(row?.lockedUntil).not.toBeNull();
  });

  it("does_not_lock_a_correct_login_and_clears_prior_failures", async () => {
    await request(server).post("/auth/login").send({ email, password: "wrong" }).expect(401);
    await request(server)
      .post("/auth/login")
      .send({ email, password: "Correct-Horse-1" })
      .expect(200);
    const row = await prisma.loginAttempt.findUnique({ where: { key: email.toLowerCase() } });
    expect(row?.failures).toBe(0);
  });
});

describe("Auth edge rate limit (e2e)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue(new InMemoryRateLimiter({ max: 3, windowSeconds: 60 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("returns_429_with_retry_after_once_the_per_ip_window_cap_is_exceeded", async () => {
    // Unique per-run emails so persistent account-lockout state never fires —
    // only the in-memory IP cap can produce a 429 here. With max=3 a rate-limit
    // 429 appears within a handful of attempts; assert the limiter engages.
    const run = randomUUID();
    let rateLimited: request.Response | undefined;
    for (let i = 0; i < 6 && rateLimited === undefined; i++) {
      const res = await request(server)
        .post("/auth/login")
        .send({ email: `flood-${run}-${String(i)}@example.com`, password: "x" });
      if (res.status === 429) {
        rateLimited = res;
      } else {
        expect(res.status).toBe(401);
      }
    }
    expect(rateLimited).toBeDefined();
    expect(rateLimited?.headers["retry-after"]).toBeDefined();
    expect((rateLimited?.body as { message: string }).message).toMatch(/too many requests/i);
  });
});
