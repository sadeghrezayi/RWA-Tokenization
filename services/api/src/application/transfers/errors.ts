import { ApplicationError } from "../identity/errors.js";

export class AssetNotTokenizedForTransferError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" is not tokenized, so its tokens cannot be transferred`);
  }
}

export class TransferNotAllowedError extends ApplicationError {
  constructor() {
    super("both the sender and recipient must hold an approved KYC to transfer");
  }
}

export class InsufficientTokenBalanceError extends ApplicationError {
  constructor() {
    super("the sender does not hold enough tokens for this transfer");
  }
}
