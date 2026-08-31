import { beforeEach, describe, expect, it } from "vitest";
import {
  SettleAllocation,
  captureReferenceFor,
} from "../../../src/application/offerings/settle-allocation.js";
import { MintAllocation } from "../../../src/application/offerings/mint-allocation.js";
import { MintPreconditionError } from "../../../src/application/offerings/errors.js";
import {
  FakeSettlementRail,
  InMemoryAllocationMintLog,
  RecordingAssetTokenIssuer,
} from "../../fakes/offering-fakes.js";

// P0-2 step 3 (K-34). The ordering fix: an allocation's money is captured only
// once its tokens exist.
//
// Before this, `CloseOffering` captured first and minted second, so a refused
// mint left an investor who had paid and held nothing. Reversing the order
// makes the worst case "money still held in escrow, no tokens" instead of
// "money taken, no tokens" — a state that is still wrong, but recoverable by
// releasing the hold rather than by clawing a payment back.
describe("SettleAllocation", () => {
  let issuer: RecordingAssetTokenIssuer;
  let mints: InMemoryAllocationMintLog;
  let rail: FakeSettlementRail;
  let settle: SettleAllocation;

  const ALLOCATION = {
    offeringId: "off-1",
    tokenAddress: "0xToken",
    investorId: "alice",
    tokens: 60n,
    costRial: 60_000n,
  };

  beforeEach(() => {
    issuer = new RecordingAssetTokenIssuer();
    mints = new InMemoryAllocationMintLog();
    rail = new FakeSettlementRail();
    rail.credit("alice", 60_000n);
    settle = new SettleAllocation(
      new MintAllocation(issuer, mints),
      rail,
      {
        // Reads the same fake the capture debits, so the pre-mint check and the
        // movement cannot disagree.
        heldFor: (investorId) => Promise.resolve(rail.held.get(investorId) ?? 0n),
      },
      mints,
    );
  });

  const hold = async (): Promise<void> => {
    await rail.hold("alice", 60_000n);
  };

  it("captures the money once the tokens exist", async () => {
    await hold();

    await settle.execute(ALLOCATION);

    expect(issuer.minted).toHaveLength(1);
    expect(rail.captured.get("alice")).toBe(60_000n);
    expect(rail.held.get("alice")).toBe(0n);
  });

  it("mints BEFORE it captures, so a refusal cannot take the money", async () => {
    // The actual K-34 defect. The order is the behaviour under test, so assert
    // on the order and not merely on the end state.
    await hold();
    let mintsWhenCaptured = -1;
    rail.onCapture = () => {
      mintsWhenCaptured = issuer.minted.length;
    };

    await settle.execute(ALLOCATION);

    // Observed at the instant the money moved: the tokens already existed.
    expect(mintsWhenCaptured).toBe(1);
    expect(rail.captureLog).toEqual([
      { investorId: "alice", amountRial: 60_000n, reference: captureReferenceFor("off-1") },
    ]);
  });

  it("leaves the money HELD when the mint is refused", async () => {
    await hold();
    issuer.failNextMint = new MintPreconditionError("holder not registered");

    await expect(settle.execute(ALLOCATION)).rejects.toThrow(MintPreconditionError);

    // Nothing captured, and the escrow is intact: the investor's Rial is still
    // theirs, and releasing it is a decision someone can still make.
    expect(rail.captured.get("alice")).toBeUndefined();
    expect(rail.held.get("alice")).toBe(60_000n);
  });

  it("captures once when settlement runs twice", async () => {
    // A redelivered outbox message replays the whole unit. The mint is already
    // idempotent (step 1); the capture has to be too, or the retry that step 2
    // added would debit the investor a second time.
    await hold();

    await settle.execute(ALLOCATION);
    await settle.execute(ALLOCATION);

    expect(rail.captured.get("alice")).toBe(60_000n);
    expect(rail.captureLog).toHaveLength(1);
  });

  it("does not touch the rail for a zero-cost allocation", async () => {
    await settle.execute({ ...ALLOCATION, costRial: 0n });

    expect(issuer.minted).toHaveLength(1);
    expect(rail.captureLog).toEqual([]);
  });
});
