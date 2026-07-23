import type { PrismaClient } from "@prisma/client";
import { LoginThrottle } from "../../domain/identity/login-throttle.js";
import type { LoginAttemptStore } from "../../application/identity/ports.js";

// Persists the T4 account-lockout state. Platform-level and pre-auth, so it
// takes the RAW Prisma client (not the tenant-scoped one) and may use upsert.
export class PrismaLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly prisma: PrismaClient) {}

  async load(key: string): Promise<LoginThrottle> {
    const row = await this.prisma.loginAttempt.findUnique({ where: { key } });
    if (row === null) {
      return LoginThrottle.empty();
    }
    return LoginThrottle.restore({
      failures: row.failures,
      windowStartedAt: row.windowStartedAt ?? undefined,
      lockedUntil: row.lockedUntil ?? undefined,
    });
  }

  async save(key: string, throttle: LoginThrottle): Promise<void> {
    const data = {
      failures: throttle.failures,
      windowStartedAt: throttle.windowStartedAt ?? null,
      lockedUntil: throttle.lockedUntil ?? null,
    };
    await this.prisma.loginAttempt.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  }
}
