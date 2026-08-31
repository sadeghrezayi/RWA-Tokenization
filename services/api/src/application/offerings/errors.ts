import { ApplicationError } from "../identity/errors.js";

export class OfferingNotFoundError extends ApplicationError {
  constructor(offeringId: string) {
    super(`no offering found with id "${offeringId}"`);
  }
}

export class AssetNotTokenizedError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" must be tokenized before an offering can be created`);
  }
}

export class InvestorNotEligibleError extends ApplicationError {
  constructor() {
    super("the investor must hold an approved KYC before subscribing");
  }
}

// Thrown by SettlementRail implementations when a hold exceeds the balance.
export class InsufficientFundsError extends ApplicationError {
  constructor() {
    super("insufficient ledger balance for this subscription");
  }
}

// P0-2 step 1: a mint was claimed but never confirmed, so its on-chain outcome
// is unknown. Deliberately fails the settlement rather than guessing: minting
// again may double-issue, and skipping silently leaves a holder who paid with
// nothing and nothing to complain about. A person has to reconcile it.
export class UnresolvedMintError extends ApplicationError {
  constructor(offeringId: string, investorId: string) {
    super(
      `the mint for investor ${investorId} on offering ${offeringId} was started but never ` +
        `confirmed — its on-chain outcome must be reconciled before this offering can settle`,
    );
  }
}

// P0-2 step 2: a mint that was refused BEFORE any transaction was sent — the
// holder has no on-chain identity yet, or the token is paused.
//
// The distinction matters because it decides whether a retry is safe. Nothing
// can land later, so the allocation's claim is released and the work can be
// tried again. Any OTHER failure might mean a transaction is in flight, where
// retrying could double-issue — those keep the claim and become `unresolved`,
// which asks for a person.
export class MintPreconditionError extends ApplicationError {}

// P0-2 step 3 residue: the manual escrow-release lever refuses anything it
// cannot prove is stranded.
export class AllocationNotStrandedError extends Error {
  constructor(offeringId: string, investorId: string) {
    super(
      `allocation ${offeringId}/${investorId} is not stranded — it has no unminted allocation ` +
        "holding money, so there is nothing to release",
    );
  }
}

export class ReleaseReasonRequiredError extends Error {
  constructor() {
    super("releasing an investor's escrow requires a reason, so the decision stays answerable");
  }
}

// The pre-K-34 shape: settlement used to capture the money BEFORE attempting
// the mint, so an allocation from before 2026-08-25 whose mint failed has its
// cost TAKEN, not held. The escrow screen derives "money held" from the
// allocation cost and cannot tell those apart, so an operator can be invited to
// return money that is no longer there.
export class EscrowNoLongerHeldError extends Error {
  constructor(offeringId: string, investorId: string, costRial: bigint, heldRial: bigint) {
    super(
      `allocation ${offeringId}/${investorId} cost ${costRial.toString()} Rial but only ` +
        `${heldRial.toString()} is held — this money is NO LONGER HELD. It was almost certainly ` +
        "captured under the settlement order used before 2026-08-25, which took payment before " +
        "minting. Returning it is a refund decision, not an escrow release, and this lever " +
        "deliberately will not make it",
    );
  }
}

// Reversing the settlement order (K-34) removed "money taken, no tokens" and
// necessarily introduced its mirror: a mint that lands followed by a capture
// that fails, leaving tokens issued and never paid for. The mint is on-chain
// and irreversible while the capture is a local write, so the only place to
// stop that is BEFORE minting.
export class EscrowMissingForMintError extends Error {
  constructor(offeringId: string, investorId: string, costRial: bigint, heldRial: bigint) {
    super(
      `refusing to mint ${offeringId}/${investorId}: the escrow is not there — ` +
        `${costRial.toString()} Rial is owed but only ${heldRial.toString()} is held. ` +
        "Minting first would issue tokens the platform cannot charge for, and a confirmed mint " +
        "is invisible to every 'awaiting mint' report. The allocation stays unminted so it " +
        "remains visible and recoverable",
    );
  }
}
