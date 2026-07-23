import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLoginAttemptStore } from "../../src/infrastructure/persistence/prisma-login-attempt-store.js";
import { LoginThrottle } from "../../src/domain/identity/login-throttle.js";

const prisma = new PrismaClient();
const store = new PrismaLoginAttemptStore(prisma);
const CONFIG = { maxFailures: 3, windowSeconds: 900, lockoutSeconds: 900 };

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaLoginAttemptStore (integration)", () => {
  it("defaults_to_empty_for_an_unknown_key", async () => {
    const throttle = await store.load(`unknown-${randomUUID()}`);
    expect(throttle.failures).toBe(0);
    expect(throttle.isLocked(new Date())).toBe(false);
  });

  it("round_trips_a_locked_throttle_and_overwrites_on_save", async () => {
    const key = `lock-${randomUUID()}`;
    const now = new Date("2026-07-23T10:00:00.000Z");
    let throttle = LoginThrottle.empty();
    for (let i = 0; i < 3; i++) {
      throttle = throttle.recordFailure(now, CONFIG);
    }
    await store.save(key, throttle);

    const loaded = await store.load(key);
    expect(loaded.failures).toBe(3);
    expect(loaded.isLocked(now)).toBe(true);
    expect(loaded.retryAfterSeconds(now)).toBe(900);

    // A success clears it.
    await store.save(key, loaded.recordSuccess());
    const cleared = await store.load(key);
    expect(cleared.failures).toBe(0);
    expect(cleared.isLocked(now)).toBe(false);
  });
});
