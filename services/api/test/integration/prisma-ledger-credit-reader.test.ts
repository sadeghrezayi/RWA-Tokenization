import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLedgerCreditReader } from "../../src/infrastructure/persistence/prisma-ledger-credit-reader.js";

const prisma = new PrismaClient();
const reader = new PrismaLedgerCreditReader(prisma);

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
    await entry("recon-a", 67_000n, "dist-1");
    await entry("recon-b", 33_000n, "dist-1");

    expect((await reader.creditedPerReference()).get("dist-1")).toBe(100_000n);
  });

  it("keeps distributions apart", async () => {
    await entry("recon-a", 10_000n, "dist-1");
    await entry("recon-b", 25_000n, "dist-2");

    const totals = await reader.creditedPerReference();
    expect(totals.get("dist-1")).toBe(10_000n);
    expect(totals.get("dist-2")).toBe(25_000n);
  });

  it("EXCLUDES entries with no reference rather than lumping them together", async () => {
    // These predate the column. Grouping them under a blank key would invent a
    // distribution; counting them anywhere would corrupt a real one's total.
    await entry("recon-old", 99_000n, null);
    await entry("recon-a", 10_000n, "dist-1");

    const totals = await reader.creditedPerReference();
    expect(totals.get("dist-1")).toBe(10_000n);
    expect([...totals.keys()]).toEqual(["dist-1"]);
  });

  it("ignores credits that are not distribution payouts", async () => {
    // A redemption is money leaving for a different reason; counting it would
    // make a distribution look overpaid.
    await entry("recon-r", 50_000n, "dist-1", "redemption");
    await entry("recon-a", 10_000n, "dist-1");

    expect((await reader.creditedPerReference()).get("dist-1")).toBe(10_000n);
  });
});
