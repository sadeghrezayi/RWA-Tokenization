import {
  AllocationNotStrandedError,
  EscrowNoLongerHeldError,
  ReleaseReasonRequiredError,
  UnresolvedMintError,
} from "./errors.js";
import type { AllocationMintLog, SettlementRail } from "./ports.js";

// What the release is FOR, written into the ledger entry's reference. Distinct
// from the settlement capture's `offering:<id>` so an auditor reading the ledger
// can tell a returned escrow from a completed sale, and so the two can never
// collide on the unique index.
export const strandedReleaseReferenceFor = (offeringId: string): string =>
  `offering:${offeringId}:stranded`;

export interface StrandedAllocation {
  allocated: bigint;
  costRial: bigint;
}

export interface StrandedAllocationReader {
  find(key: { offeringId: string; investorId: string }): Promise<StrandedAllocation | undefined>;
}

// Named fields rather than a loose bag: this record is the answer to "who
// returned this money and why", and the adapter maps it onto the platform's
// existing audit trail (FR-RA-2), which is keyed by ASSET — something this use
// case has no business knowing about.
export interface EscrowReleaseRecord {
  offeringId: string;
  investorId: string;
  amountRial: string;
  actor: string;
  reason: string;
}

export interface ReleaseAudit {
  record(entry: EscrowReleaseRecord): Promise<void>;
}

// Narrow on purpose (ISP): this use case needs two facts about the ledger, not
// everything the settlement rail can do.
export interface HeldFundsReader {
  heldFor(investorId: string): Promise<bigint>;
  // Has THIS allocation's escrow already gone back? Distinct from "the money is
  // not held", which it would otherwise be indistinguishable from — see the
  // ordering note in `execute`.
  alreadyReleased(investorId: string, reference: string): Promise<boolean>;
}

// P0-2 step 3's residue, made actionable. Capture follows the mint now, so a
// mint that never lands leaves an investor's Rial held indefinitely — visible
// on the health probe and in the escrow screen, but with nothing able to act on
// it. This is that one lever.
//
// IT IS MANUAL, AND THAT IS THE DESIGN. There is no timer and no automatic
// release, because "how long should an investor's money sit before it goes
// back" is a policy nobody has set. Encoding a guess would be worse than
// leaving a person to decide case by case: too short returns money for a mint
// that was about to succeed, too long is indistinguishable from doing nothing.
// This does not answer that question — it makes it answerable.
export class ReleaseStrandedEscrow {
  constructor(
    private readonly allocations: StrandedAllocationReader,
    private readonly mints: AllocationMintLog,
    private readonly rail: SettlementRail,
    private readonly audit: ReleaseAudit,
    private readonly heldFunds: HeldFundsReader,
  ) {}

  async execute(input: {
    offeringId: string;
    investorId: string;
    reason: string;
    actorId: string;
  }): Promise<void> {
    const reason = input.reason.trim();
    if (reason === "") {
      // Returning someone's money is a judgement, not a mechanism. Six months
      // later the only question that matters is why, and an empty reason makes
      // it unanswerable.
      throw new ReleaseReasonRequiredError();
    }

    const key = { offeringId: input.offeringId, investorId: input.investorId };
    const state = await this.mints.stateOf(key);
    if (state === "minted") {
      // The tokens exist. Releasing would leave the holder with both the tokens
      // and their money — the exact mirror of the bug K-34 was about.
      throw new AllocationNotStrandedError(input.offeringId, input.investorId);
    }
    if (state === "unresolved") {
      // Claimed and never confirmed: nobody knows whether the chain took it.
      // Releasing might hand back money for tokens that DID land, so this needs
      // the chain reconciled first — the same refusal MintAllocation makes.
      throw new UnresolvedMintError(input.offeringId, input.investorId);
    }

    const allocation = await this.allocations.find(key);
    if (allocation === undefined || allocation.allocated <= 0n || allocation.costRial <= 0n) {
      throw new AllocationNotStrandedError(input.offeringId, input.investorId);
    }

    // Is the money actually still there? The escrow list derives "held" from the
    // allocation's COST, which is only the same thing for allocations settled
    // after 2026-08-25 — before that, capture ran BEFORE the mint, so a failed
    // mint left the cost taken rather than held. Without this check the rail
    // refuses in its own accounting language ("release exceeds held funds"),
    // which contradicts the screen that just said this money was held.
    // ORDER MATTERS between these two checks, and getting it wrong is how a
    // second operator gets told the money was captured years ago when in fact
    // their colleague returned it a minute earlier. Both look identical from
    // the balance alone: nothing is held either way.
    const reference = strandedReleaseReferenceFor(input.offeringId);
    if (await this.heldFunds.alreadyReleased(input.investorId, reference)) {
      // Already back with the investor. A no-op rather than an error: two
      // operators working the same stuck allocation is the expected case, and
      // the outcome they wanted is the outcome that holds.
      return;
    }

    const held = await this.heldFunds.heldFor(input.investorId);
    if (held < allocation.costRial) {
      throw new EscrowNoLongerHeldError(
        input.offeringId,
        input.investorId,
        allocation.costRial,
        held,
      );
    }

    // Audited only once every precondition has passed, and still BEFORE the
    // money moves. Both orderings can lie, and this is the less damaging lie: a
    // record of a release that then failed is a puzzle, while a release with no
    // record of who ordered it is unanswerable. Checking first shrinks the
    // window to the release itself.
    await this.audit.record({
      offeringId: input.offeringId,
      investorId: input.investorId,
      amountRial: allocation.costRial.toString(),
      actor: input.actorId,
      reason,
    });

    // The reference makes this exactly-once: two operators looking at the same
    // stuck allocation is the expected case, and the second must move nothing.
    await this.rail.release(input.investorId, allocation.costRial, reference);
  }
}
