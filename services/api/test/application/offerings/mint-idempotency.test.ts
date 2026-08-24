import { beforeEach, describe, expect, it } from "vitest";
import { MintAllocation } from "../../../src/application/offerings/mint-allocation.js";
import { UnresolvedMintError } from "../../../src/application/offerings/errors.js";
import {
  InMemoryAllocationMintLog,
  RecordingAssetTokenIssuer,
} from "../../fakes/offering-fakes.js";

// P0-2, step 1 of the order the backlog sets out: record the mint per
// allocation and make it idempotent. A redelivered message must be a no-op.
//
// Nothing recorded that an allocation had been minted, so `mint` ran
// unconditionally. Replaying a close — or, once step 2 puts this on the outbox,
// redelivering the message — issues the tokens twice. That inflates the asset's
// supply against the holder registry an auditor reconciles it with (FR-RA-4).
describe("MintAllocation", () => {
  let issuer: RecordingAssetTokenIssuer;
  let mints: InMemoryAllocationMintLog;
  let mint: MintAllocation;

  const ALLOCATION = {
    offeringId: "off-1",
    tokenAddress: "0xToken",
    investorId: "alice",
    tokens: 60n,
  };
  const KEY = { offeringId: "off-1", investorId: "alice" };

  beforeEach(() => {
    issuer = new RecordingAssetTokenIssuer();
    mints = new InMemoryAllocationMintLog();
    mint = new MintAllocation(issuer, mints);
  });

  it("mints once and records that it did", async () => {
    await mint.execute(ALLOCATION);

    expect(issuer.minted).toEqual([{ tokenAddress: "0xToken", investorId: "alice", tokens: 60n }]);
    expect(await mints.stateOf(KEY)).toBe("minted");
  });

  it("is a NO-OP when the same allocation arrives again", async () => {
    // The redelivery case, and the whole point of the record.
    await mint.execute(ALLOCATION);
    issuer.minted.length = 0;

    await mint.execute(ALLOCATION);

    expect(issuer.minted).toEqual([]);
  });

  it("REFUSES an allocation whose previous attempt was never confirmed", async () => {
    // Claimed but not confirmed: the process died between sending the mint and
    // recording it, so the chain's answer is unknown. Both easy paths are
    // wrong, so it stops.
    await mints.claim(KEY, 60n);

    await expect(mint.execute(ALLOCATION)).rejects.toThrow(UnresolvedMintError);
    // Named, so the reconciliation has somewhere to start.
    await expect(mint.execute(ALLOCATION)).rejects.toThrow(/alice/);
    expect(issuer.minted).toEqual([]);
  });

  it("does not record a mint that the chain rejected", async () => {
    // If the claim survived a failed mint, the allocation would be stuck
    // `unresolved` forever over what was really a clean failure. It stays
    // claimed — which is honest, because the transaction may still land — and
    // that is exactly why the unresolved state refuses rather than guesses.
    issuer.failNextMint = new Error("chain refused: holder not registered");

    await expect(mint.execute(ALLOCATION)).rejects.toThrow(/chain refused/);
    expect(await mints.stateOf(KEY)).toBe("unresolved");
  });

  it("loses the race gracefully when another caller claims it first", async () => {
    // Two deliveries in flight at once. `claim` is the single writer that
    // decides, so the loser must not also mint.
    const racing = new InMemoryAllocationMintLog();
    const first = new MintAllocation(issuer, racing);
    // Simulate the other caller winning between this caller's read and write.
    racing.onNextStateRead = () => {
      void racing.claim(KEY, 60n);
    };

    await first.execute(ALLOCATION);

    expect(issuer.minted).toEqual([]);
  });
});
