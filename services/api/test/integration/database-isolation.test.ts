import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setup } from "./use-a-separate-database.js";

/**
 * The guard on the thing that protects a developer's data.
 *
 * Fifteen files in this suite clear whole tables. That is only safe because
 * `use-a-separate-database.ts` redirects the suite away from whatever
 * DATABASE_URL was configured — the database the dev server serves from. If
 * that redirect is ever removed, weakened, or silently skipped, the next full
 * run destroys someone's demo data and nothing says a word. So it is asserted.
 */
describe("the integration suite's database", () => {
  it("is not the one the developer configured", () => {
    const before = process.env.DATABASE_URL_BEFORE_TESTS;
    expect(before, "global setup must record the URL it redirected away from").toBeTruthy();
    expect(process.env.DATABASE_URL).toBeTruthy();
    expect(process.env.DATABASE_URL).not.toBe(before);
  });

  it("is the database the queries actually run against", async () => {
    const prisma = new PrismaClient();
    try {
      const [row] = await prisma.$queryRaw<{ current_database: string }[]>`
        select current_database()
      `;
      const connected = row?.current_database;
      const configured = new URL(process.env.DATABASE_URL_BEFORE_TESTS ?? "postgresql://x/none")
        .pathname;
      // Reading the name from the server, not from the string we set: an env
      // var proves intent, `current_database()` proves where the writes went.
      expect(connected).toBeTruthy();
      expect(`/${connected ?? ""}`).not.toBe(configured);
    } finally {
      await prisma.$disconnect();
    }
  });

  // The refusal matters more than it looks: with no URL there is nothing to
  // derive a test database FROM, and a setup that shrugged and carried on
  // would hand the suite back to whatever Prisma defaults to.
  it("refuses to run at all when no database is configured", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(setup()).rejects.toThrow(/DATABASE_URL must be set/);
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
