import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLedgerCreditReader } from "../../src/infrastructure/persistence/prisma-ledger-credit-reader.js";

const prisma = new PrismaClient();
const reader = new PrismaLedgerCreditReader(prisma);

// Namespaced to this file. The reader groups EVERY ledger entry in the
// database, so a generic id like "dist-1" can collide with a payout another
// suite legitimately made.
const REF_A = "recon-ref-a";
const REF_B = "recon-ref-b";

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { investorId: { startsWith: "recon-" } } });
});

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { investorId: { startsWith: "recon-" } } });
  await prisma.$disconnect();
});

describe("PrismaLedgerCreditReader (integration, real Postgres)", () => {
  const entry = (
    investorId: string,
    amountRial: bigint,
    reference: string | null,
    kind = "distribution",
  ) =>
    prisma.ledgerEntry.create({
      data: { investorId, kind, amountRial, actor: "platform", reference },
    });

  it("sums every credit belonging to one distribution", async () => {
    await entry("recon-a", 67_000n, REF_A);
    await entry("recon-b", 33_000n, REF_A);

    expect((await reader.creditedPerReference()).get(REF_A)).toBe(100_000n);
  });

  it("keeps distributions apart", async () => {
    await entry("recon-a", 10_000n, REF_A);
    await entry("recon-b", 25_000n, REF_B);

    const totals = await reader.creditedPerReference();
    expect(totals.get(REF_A)).toBe(10_000n);
    expect(totals.get(REF_B)).toBe(25_000n);
  });

  it("EXCLUDES entries with no reference rather than lumping them together", async () => {
    // These predate the column. Grouping them under a blank key would invent a
    // distribution; counting them anywhere would corrupt a real one's total.
    await entry("recon-old", 99_000n, null);
    await entry("recon-a", 10_000n, REF_A);

    const totals = await reader.creditedPerReference();
    expect(totals.get(REF_A)).toBe(10_000n);
    // Asserted as a property of THIS test's data, not of the whole table.
    // `toEqual([REF_A])` passed alone and failed in the full battery, where
    // another suite's payout (`dist-yd`) is legitimately present — the reader
    // groups every ledger entry in the database, while this file only cleans
    // its own `recon-` rows. The real property is that a NULL reference never
    // becomes a key and never lands inside a real one.
    expect([...totals.keys()].filter((key) => key === "" || key === "null")).toEqual([]);
    expect([...totals.values()]).not.toContain(99_000n);
  });

  it("ignores credits that are not distribution payouts", async () => {
    // A redemption is money leaving for a different reason; counting it would
    // make a distribution look overpaid.
    await entry("recon-r", 50_000n, REF_A, "redemption");
    await entry("recon-a", 10_000n, REF_A);

    expect((await reader.creditedPerReference()).get(REF_A)).toBe(10_000n);
  });
});
