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
    await rail.capture("inv-1", 20_000n, "offering:off-a");

    expect(await rail.balanceOf("inv-1")).toEqual({ balanceRial: 30_000n, heldRial: 0n });
    const kinds = (await prisma.ledgerEntry.findMany({ orderBy: { id: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual(["credit", "hold", "release", "capture"]);
  });

  it("credits_a_redemption_payout_with_its_own_entry_kind", async () => {
    await rail.payoutRedemption("inv-r", 312_500_000n);

    expect(await rail.balanceOf("inv-r")).toEqual({ balanceRial: 312_500_000n, heldRial: 0n });
    const entries = await prisma.ledgerEntry.findMany({ where: { investorId: "inv-r" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "redemption", amountRial: 312_500_000n });
  });

  it("records WHICH distribution a payout came from (FR-RA-4)", async () => {
    // TypeScript cannot catch this: a method taking fewer parameters still
    // satisfies the port, so an adapter that ignores `reference` compiles
    // cleanly and silently loses the auditor's only link back to what was
    // declared. Only a round trip against the real column proves it.
    await rail.payout("inv-d", 100_000n, "dist-1");

    const entries = await prisma.ledgerEntry.findMany({ where: { investorId: "inv-d" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "distribution",
      amountRial: 100_000n,
      reference: "dist-1",
    });
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
    await expect(rail.capture("inv-1", 6_000n, "offering:off-b")).rejects.toThrow(
      /capture exceeds/,
    );
  });

  // P0-2 step 3 (K-34). Settlement is retried through the outbox, so the same
  // capture WILL be asked for twice; the ledger has to refuse the second one.
  it("captures_at_most_once_per_reference_even_when_asked_twice", async () => {
    await rail.credit("inv-2", 50_000n, "officer-1");
    await rail.hold("inv-2", 40_000n);

    await rail.capture("inv-2", 40_000n, "offering:off-1");
    await rail.capture("inv-2", 40_000n, "offering:off-1");

    // Debited once: the balance is what one capture leaves, not two.
    expect(await rail.balanceOf("inv-2")).toEqual({ balanceRial: 10_000n, heldRial: 0n });
    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(1);
  });

  it("still_captures_separately_for_a_different_offering", async () => {
    // The guard is per cause, not per investor — an investor settling two
    // offerings must be debited for both.
    await rail.credit("inv-3", 50_000n, "officer-1");
    await rail.hold("inv-3", 40_000n);

    await rail.capture("inv-3", 15_000n, "offering:off-1");
    await rail.capture("inv-3", 25_000n, "offering:off-2");

    expect(await prisma.ledgerEntry.count({ where: { kind: "capture" } })).toBe(2);
    expect(await rail.balanceOf("inv-3")).toEqual({ balanceRial: 10_000n, heldRial: 0n });
  });

  it("does_not_debit_when_the_duplicate_capture_is_a_no_op", async () => {
    // The dangerous shape of the bug: the second call must not decrement `held`
    // as a side effect before the unique index rejects the entry.
    await rail.credit("inv-4", 50_000n, "officer-1");
    await rail.hold("inv-4", 40_000n);
    await rail.capture("inv-4", 20_000n, "offering:off-1");
    const after = await rail.balanceOf("inv-4");

    await rail.capture("inv-4", 20_000n, "offering:off-1");

    expect(await rail.balanceOf("inv-4")).toEqual(after);
  });

  // P0-2 step 3 residue: the manual escrow-release lever asks for a release
  // that must happen at most once, while the compensating release in
  // SubscribeToOffering has no id and legitimately repeats. Both live here.
  it("releases_at_most_once_for_a_given_reference", async () => {
    await rail.credit("inv-rel", 50_000n, "officer-1");
    await rail.hold("inv-rel", 40_000n);

    await rail.release("inv-rel", 40_000n, "offering:off-1:stranded");
    await rail.release("inv-rel", 40_000n, "offering:off-1:stranded");

    expect(await rail.balanceOf("inv-rel")).toEqual({ balanceRial: 50_000n, heldRial: 0n });
    expect(await prisma.ledgerEntry.count({ where: { kind: "release" } })).toBe(1);
  });

  it("still allows repeated UNREFERENCED releases, which compensate a failed hold", async () => {
    // SubscribeToOffering releases the hold it just took when persistence
    // fails. That can happen many times over a session and must never be
    // deduplicated into silence.
    await rail.credit("inv-comp", 50_000n, "officer-1");
    await rail.hold("inv-comp", 10_000n);
    await rail.release("inv-comp", 10_000n);
    await rail.hold("inv-comp", 10_000n);
    await rail.release("inv-comp", 10_000n);

    expect(await rail.balanceOf("inv-comp")).toEqual({ balanceRial: 50_000n, heldRial: 0n });
    expect(await prisma.ledgerEntry.count({ where: { kind: "release" } })).toBe(2);
  });

  it("keeps a stranded release apart from the settlement capture on the same offering", async () => {
    // Both key on the offering. If they collided on the unique index, one would
    // silently no-op the other — a captured sale and a returned escrow are
    // opposite facts and must never share a key.
    await rail.credit("inv-both", 100_000n, "officer-1");
    await rail.hold("inv-both", 100_000n);

    await rail.capture("inv-both", 40_000n, "offering:off-9");
    await rail.release("inv-both", 60_000n, "offering:off-9:stranded");

    expect(await rail.balanceOf("inv-both")).toEqual({ balanceRial: 60_000n, heldRial: 0n });
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
