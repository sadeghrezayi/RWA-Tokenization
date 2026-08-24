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
