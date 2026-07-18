import { ApplicationError } from "../identity/errors.js";

export class RedemptionNotFoundError extends ApplicationError {
  constructor(redemptionId: string) {
    super(`no redemption found with id "${redemptionId}"`);
  }
}

// FR-OR-3 honest degradation: a redemption cannot be priced without a fresh
// signed valuation — the action is blocked rather than paid at a stale value.
export class NoFreshValuationError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" has no fresh valuation attestation to price the redemption`);
  }
}
