import { ApplicationError } from "../identity/errors.js";

export class DistributionNotFoundError extends ApplicationError {
  constructor(distributionId: string) {
    super(`no distribution found with id "${distributionId}"`);
  }
}

export class AssetNotTokenizedForDistributionError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" must be tokenized before a distribution can be declared`);
  }
}

export class NoHoldersError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" has no token holders to distribute to`);
  }
}
