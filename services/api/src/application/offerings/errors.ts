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
