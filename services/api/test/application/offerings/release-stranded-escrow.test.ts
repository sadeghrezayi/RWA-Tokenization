import { beforeEach, describe, expect, it } from "vitest";
import {
  ReleaseStrandedEscrow,
  strandedReleaseReferenceFor,
} from "../../../src/application/offerings/release-stranded-escrow.js";
import type {
  EscrowReleaseRecord,
  StrandedAllocationReader,
} from "../../../src/application/offerings/release-stranded-escrow.js";
import {
  AllocationNotStrandedError,
  ReleaseReasonRequiredError,
  UnresolvedMintError,
} from "../../../src/application/offerings/errors.js";
import { FakeSettlementRail, InMemoryAllocationMintLog } from "../../fakes/offering-fakes.js";

const OFFERING = "off-1";
const INVESTOR = "alice";
const COST = 60_000n;
const ACTOR = "treasury-1";
const REASON = "chain refused the mint for six days; holder asked for their money back";

// P0-2 step 3's residue, made actionable — the ONE lever, and deliberately the
// smallest one that can exist.
//
// It is MANUAL. There is no timer and no automatic release, because "how long
// should an investor's money sit before it is returned" is a policy nobody has
// set, and encoding a guess would be worse than leaving a person to decide each
// case. This does not answer that question; it makes it answerable.
describe("ReleaseStrandedEscrow", () => {
  let rail: FakeSettlementRail;
  let mints: InMemoryAllocationMintLog;
  let events: { events: EscrowReleaseRecord[] };
  let release: ReleaseStrandedEscrow;

  // Typed as the port, not inferred from the happy-path literal — otherwise the
  // "allocation does not exist" case cannot be expressed at all.
  const allocations: StrandedAllocationReader = {
    find: () => Promise.resolve({ allocated: 60n, costRial: COST }),
  };

  const build = (reader: StrandedAllocationReader = allocations) =>
    new ReleaseStrandedEscrow(reader, mints, rail, {
      record: (entry: EscrowReleaseRecord) => {
        events.events.push(entry);
        return Promise.resolve();
      },
    });

  beforeEach(async () => {
    rail = new FakeSettlementRail();
    mints = new InMemoryAllocationMintLog();
    events = { events: [] };
    rail.credit(INVESTOR, COST);
    await rail.hold(INVESTOR, COST);
    release = build();
  });

  it("returns the money to the investor's own balance", async () => {
    await release.execute({
      offeringId: OFFERING,
      investorId: INVESTOR,
      reason: REASON,
      actorId: ACTOR,
    });

    expect(rail.held.get(INVESTOR)).toBe(0n);
    expect(rail.balances.get(INVESTOR)).toBe(COST);
    // Never captured: this is the investor's money going back, not the
    // platform taking it.
    expect(rail.captured.get(INVESTOR)).toBeUndefined();
  });

  it("REFUSES when the tokens actually exist", async () => {
    // The worst thing this lever could do: hand back the money for an
    // allocation that was minted, leaving the holder with both the tokens and
    // the cash.
    await mints.claim({ offeringId: OFFERING, investorId: INVESTOR }, 60n);
    await mints.confirm({ offeringId: OFFERING, investorId: INVESTOR });

    await expect(
      release.execute({
        offeringId: OFFERING,
        investorId: INVESTOR,
        reason: REASON,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(AllocationNotStrandedError);
    expect(rail.held.get(INVESTOR)).toBe(COST);
  });

  it("REFUSES an unresolved mint, where nobody knows if the tokens exist", async () => {
    // Claimed but never confirmed. The chain's answer is unknown, so releasing
    // might be handing back money for tokens that DID land. That needs a person
    // to reconcile the chain first — the same reason MintAllocation refuses it.
    await mints.claim({ offeringId: OFFERING, investorId: INVESTOR }, 60n);

    await expect(
      release.execute({
        offeringId: OFFERING,
        investorId: INVESTOR,
        reason: REASON,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(UnresolvedMintError);
    expect(rail.held.get(INVESTOR)).toBe(COST);
  });

  it("REFUSES without a reason, because this has to be answerable later", async () => {
    await expect(
      release.execute({
        offeringId: OFFERING,
        investorId: INVESTOR,
        reason: "   ",
        actorId: ACTOR,
      }),
    ).rejects.toThrow(ReleaseReasonRequiredError);
    expect(rail.held.get(INVESTOR)).toBe(COST);
  });

  it("REFUSES an allocation that does not exist", async () => {
    const missing = build({ find: () => Promise.resolve(undefined) });

    await expect(
      missing.execute({
        offeringId: OFFERING,
        investorId: INVESTOR,
        reason: REASON,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(AllocationNotStrandedError);
  });

  it("records WHO released it, for WHICH allocation, and WHY", async () => {
    await release.execute({
      offeringId: OFFERING,
      investorId: INVESTOR,
      reason: REASON,
      actorId: ACTOR,
    });

    expect(events.events).toHaveLength(1);
    const recorded = JSON.stringify(events.events[0]);
    expect(recorded).toContain(ACTOR);
    expect(recorded).toContain(OFFERING);
    expect(recorded).toContain(REASON);
  });

  it("releases at most once, however many times it is asked", async () => {
    // Two operators looking at the same stuck allocation is the expected case,
    // not the exotic one. The second must move nothing.
    await release.execute({
      offeringId: OFFERING,
      investorId: INVESTOR,
      reason: REASON,
      actorId: ACTOR,
    });
    await release.execute({
      offeringId: OFFERING,
      investorId: INVESTOR,
      reason: REASON,
      actorId: "treasury-2",
    });

    expect(rail.balances.get(INVESTOR)).toBe(COST);
    expect(rail.releaseLog).toHaveLength(1);
    expect(rail.releaseLog[0]?.reference).toBe(strandedReleaseReferenceFor(OFFERING));
  });
});
