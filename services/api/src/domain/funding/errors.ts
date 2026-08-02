export class InvalidFundingAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFundingAmountError";
  }
}

export class InvalidFundingReferenceError extends Error {
  constructor() {
    super("a funding request needs a payment reference");
    this.name = "InvalidFundingReferenceError";
  }
}

export class InvalidFundingTransitionError extends Error {
  constructor(action: string, from: string) {
    super(`cannot ${action} a funding request that is "${from}"`);
    this.name = "InvalidFundingTransitionError";
  }
}

export class MissingRejectionReasonError extends Error {
  constructor() {
    super("rejecting a funding request requires a reason");
    this.name = "MissingRejectionReasonError";
  }
}
