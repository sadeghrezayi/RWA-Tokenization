import { describe, expect, it } from "vitest";
import { SettleAllocation } from "../../../src/application/offerings/settle-allocation.js";
import { MintAllocation } from "../../../src/application/offerings/mint-allocation.js";
import {
  FakeSettlementRail,
  InMemoryAllocationMintLog,
  RecordingAssetTokenIssuer,
} from "../../fakes/offering-fakes.js";

// The failure mode the K-34 fix CREATED, written to find out whether it is real.
//
// Reversing the order removed "money taken, no tokens". It necessarily
// introduces the mirror: the mint succeeds and the capture then fails, leaving
// TOKENS ISSUED AND NEVER PAID FOR. Under the old capture-first order that was
// impossible.
//
// It matters because the escrow reporting cannot see it: both the health probe
// and the escrow list look for allocations WITHOUT a confirmed mint, and this
// allocation has one.
describe("an allocation whose escrow is gone before the mint", () => {
  it("REFUSES TO MINT, rather than issuing tokens it cannot charge for", async () => {
    // Prevention, not detection. The mint is on-chain and irreversible; the
    // capture is a local ledger write. Once the tokens exist there is no way
    // back, so the only place to stop this is BEFORE minting.
    //
    // Refusing also puts the allocation somewhere a person can see it: it stays
    // UNMINTED, which is exactly what the escrow reporting and the release
    // lever are built around. Minting and failing to charge would leave it
    // invisible to both.
    const issuer = new RecordingAssetTokenIssuer();
    const mints = new InMemoryAllocationMintLog();
    const rail = new FakeSettlementRail();
    // The investor's escrow is NOT there — released, or never held.
    const settle = new SettleAllocation(
      new MintAllocation(issuer, mints),
      rail,
      {
        heldFor: (investorId) => Promise.resolve(rail.held.get(investorId) ?? 0n),
      },
      mints,
    );

    await expect(
      settle.execute({
        offeringId: "off-1",
        tokenAddress: "0xToken",
        investorId: "alice",
        tokens: 60n,
        costRial: 60_000n,
      }),
    ).rejects.toThrow(/escrow/i);

    // No tokens were issued...
    expect(issuer.minted).toEqual([]);
    // ...and the allocation stays visible to the escrow reporting, which looks
    // for allocations WITHOUT a confirmed mint.
    expect(await mints.stateOf({ offeringId: "off-1", investorId: "alice" })).toBe("unminted");
    expect(rail.captureLog).toEqual([]);
  });

  it("mints normally when the escrow IS there", async () => {
    const issuer = new RecordingAssetTokenIssuer();
    const mints = new InMemoryAllocationMintLog();
    const rail = new FakeSettlementRail();
    rail.credit("alice", 60_000n);
    await rail.hold("alice", 60_000n);
    const settle = new SettleAllocation(
      new MintAllocation(issuer, mints),
      rail,
      {
        heldFor: (investorId) => Promise.resolve(rail.held.get(investorId) ?? 0n),
      },
      mints,
    );

    await settle.execute({
      offeringId: "off-1",
      tokenAddress: "0xToken",
      investorId: "alice",
      tokens: 60n,
      costRial: 60_000n,
    });

    expect(issuer.minted).toHaveLength(1);
    expect(rail.captured.get("alice")).toBe(60_000n);
  });

  it("does not require escrow for a zero-cost allocation", async () => {
    // A fully refunded or free allocation owes nothing, and demanding a hold
    // for it would refuse a legitimate mint.
    const issuer = new RecordingAssetTokenIssuer();
    const rail = new FakeSettlementRail();
    const mints = new InMemoryAllocationMintLog();
    const settle = new SettleAllocation(
      new MintAllocation(issuer, mints),
      rail,
      { heldFor: () => Promise.resolve(0n) },
      mints,
    );

    await settle.execute({
      offeringId: "off-1",
      tokenAddress: "0xToken",
      investorId: "alice",
      tokens: 60n,
      costRial: 0n,
    });

    expect(issuer.minted).toHaveLength(1);
  });
});
