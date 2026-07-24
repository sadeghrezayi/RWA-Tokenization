// Domain errors for the maker-checker approval lifecycle (T1/T3 four-eyes).
export abstract class ApprovalDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidApprovalError extends ApprovalDomainError {}

// A decision was attempted on an approval that is no longer pending.
export class InvalidApprovalTransitionError extends ApprovalDomainError {
  constructor() {
    super("this approval has already been decided");
  }
}

// The maker tried to approve their own request — four-eyes forbids it.
export class SelfApprovalError extends ApprovalDomainError {
  constructor() {
    super("you cannot approve your own request — a different reviewer must approve it");
  }
}
