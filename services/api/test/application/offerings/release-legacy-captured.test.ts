import { beforeEach, describe, expect, it } from "vitest";
import { ReleaseStrandedEscrow } from "../../../src/application/offerings/release-stranded-escrow.js";
import type { StrandedAllocationReader } from "../../../src/application/offerings/release-stranded-escrow.js";
import { FakeSettlementRail, InMemoryAllocationMintLog } from "../../fakes/offering-fakes.js";

// A case the escrow work has been assuming away, written to find out whether it
// is real: an allocation settled BEFORE the K-34 fix.
//
// Under the old order the money was captured FIRST and the mint attempted
// second. So a pre-fix allocation whose mint failed has: no confirmed mint, and
// its cost already TAKEN rather than held. Both the health probe and the escrow
// screen derive "money held" from `cost_rial` on the assumption that capture
// follows the mint — an assumption that is only true for allocations settled
// after 2026-08-25.
describe("ReleaseStrandedEscrow on a pre-K-34 allocation (money already captured)", () => {
  let rail: FakeSettlementRail;
  let mints: InMemoryAllocationMintLog;
  let release: ReleaseStrandedEscrow;

  const allocations: StrandedAllocationReader = {
    find: () => Promise.resolve({ allocated: 60n, costRial: 60_000n }),
  };

  beforeEach(() => {
    rail = new FakeSettlementRail();
    mints = new InMemoryAllocationMintLog();
    // The legacy shape: the investor paid, the money was CAPTURED, and the mint
    // never landed. Nothing is held.
    rail.credit("alice", 60_000n);
    rail.captured.set("alice", 60_000n);
    rail.balances.set("alice", 0n);
    release = new ReleaseStrandedEscrow(
      allocations,
      mints,
      rail,
      { record: () => Promise.resolve() },
      {
        heldFor: (investorId) => Promise.resolve(rail.held.get(investorId) ?? 0n),
        alreadyReleased: (investorId, reference) =>
          Promise.resolve(
            rail.releaseLog.some((r) => r.investorId === investorId && r.reference === reference),
          ),
      },
    );
  });

  it("does not invent money that is no longer held", async () => {
    // Whatever it does, it must not credit the investor from nothing. The
    // question this test exists to answer is HOW it refuses.
    await expect(
      release.execute({
        offeringId: "off-legacy",
        investorId: "alice",
        reason: "pre-fix allocation, mint never landed",
        actorId: "treasury-1",
      }),
    ).rejects.toThrow();

    expect(rail.balances.get("alice") ?? 0n).toBe(0n);
  });

  it("refuses with a message that names the actual problem", async () => {
    // "release exceeds held funds" is the rail's internal accounting language.
    // An operator looking at a screen that told them this money was held needs
    // to be told the money is NOT held and why — otherwise the screen and the
    // error contradict each other and neither is actionable.
    let message = "";
    try {
      await release.execute({
        offeringId: "off-legacy",
        investorId: "alice",
        reason: "pre-fix allocation, mint never landed",
        actorId: "treasury-1",
      });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message.toLowerCase()).toContain("no longer held");
  });
});
