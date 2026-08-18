/**
 * Integration tests get their OWN Postgres database.
 *
 * They used to run against whatever `DATABASE_URL` pointed at — which, on a
 * developer's machine, is the same database the dev server serves the demo
 * from. Fifteen files clear whole tables (`prisma.asset.deleteMany()` and
 * friends), so every full run silently destroyed the demo data someone had
 * just built by hand. Scoping each delete would only fix today's fifteen; the
 * next test to call `deleteMany()` would bring the problem back.
 *
 * So the suite is given a database of its own, derived from `DATABASE_URL` by
 * suffixing the database name. Wholesale deletes are then exactly right: the
 * suite owns everything in there. Set `TEST_DATABASE_URL` to override.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const testUrlFrom = (url: string): string => {
  const parsed = new URL(url);
  // `/tokenization` -> `/tokenization_test`. The leading slash is kept.
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}_test`;
  return parsed.toString();
};

// Connecting to the server's own `postgres` database, because you cannot
// CREATE DATABASE from inside the database you are creating. Prisma is used as
// the client so the suite needs no driver dependency of its own.
const createDatabaseIfMissing = async (url: string): Promise<void> => {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const existing = await client.$queryRaw<
      unknown[]
    >`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      // Identifiers cannot be parameterised, and CREATE DATABASE cannot run
      // inside a transaction. The name comes from our own DATABASE_URL, never
      // from test input, and the quotes are doubled regardless.
      await client.$executeRawUnsafe(`create database "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.$disconnect();
  }
};

export const setup = async (): Promise<void> => {
  const configured = process.env.DATABASE_URL;
  if (configured === undefined || configured === "") {
    throw new Error("DATABASE_URL must be set for the integration suite");
  }
  const testUrl = process.env.TEST_DATABASE_URL ?? testUrlFrom(configured);

  await createDatabaseIfMissing(testUrl);

  // Same migrations as production, applied the same way — the suite must not
  // be testing a schema that `migrate deploy` would never produce.
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  // Worker processes are forked after this returns, so they inherit both.
  // The original is kept so `database-isolation.test.ts` can assert we really
  // did redirect away from it — the redirect is what makes the suite's
  // wholesale deletes safe, so it is worth a test of its own.
  process.env.DATABASE_URL_BEFORE_TESTS = configured;
  process.env.DATABASE_URL = testUrl;
};
