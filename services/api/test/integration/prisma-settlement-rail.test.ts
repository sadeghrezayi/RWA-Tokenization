import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { InsufficientFundsError } from "../../src/application/offerings/errors.js";
import { PrismaSettlementRail } from "../../src/infrastructure/settlement/prisma-settlement-rail.js";

const prisma = new PrismaClient();
const rail = new PrismaSettlementRail(prisma);

beforeEach(async () => {
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaSettlementRail (integration, real Postgres)", () => {
  it("credits_holds_releases_and_captures_with_audit_entries", async () => {
    await rail.credit("inv-1", 50_000n, "officer-1");
    await rail.hold("inv-1", 30_000n);
    await rail.release("inv-1", 10_000n);
    await rail.capture("inv-1", 20_000n);

    expect(await rail.balanceOf("inv-1")).toEqual({ balanceRial: 30_000n, heldRial: 0n });
    const kinds = (await prisma.ledgerEntry.findMany({ orderBy: { id: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual(["credit", "hold", "release", "capture"]);
  });

  it("rejects_a_hold_beyond_the_balance_without_moving_anything", async () => {
    await rail.credit("inv-1", 5_000n, "officer-1");

    await expect(rail.hold("inv-1", 10_000n)).rejects.toThrow(InsufficientFundsError);
    expect(await rail.balanceOf("inv-1")).toEqual({ balanceRial: 5_000n, heldRial: 0n });
    expect(await prisma.ledgerEntry.count({ where: { kind: "hold" } })).toBe(0);
  });

  it("rejects_holds_for_unknown_accounts_and_over_releases", async () => {
    await expect(rail.hold("ghost", 1_000n)).rejects.toThrow(InsufficientFundsError);
    await rail.credit("inv-1", 5_000n, "officer-1");
    await rail.hold("inv-1", 5_000n);
    await expect(rail.release("inv-1", 6_000n)).rejects.toThrow(/release exceeds/);
    await expect(rail.capture("inv-1", 6_000n)).rejects.toThrow(/capture exceeds/);
  });

  it("serializes_concurrent_holds_so_the_balance_never_goes_negative", async () => {
    await rail.credit("inv-1", 10_000n, "officer-1");

    const results = await Promise.allSettled([
      rail.hold("inv-1", 7_000n),
      rail.hold("inv-1", 7_000n),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const { balanceRial, heldRial } = await rail.balanceOf("inv-1");
    expect(balanceRial).toBe(3_000n);
    expect(heldRial).toBe(7_000n);
  });
});
