export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidKycTransitionError extends DomainError {}

export class InvalidRejectionReasonError extends DomainError {}

export class InvalidEmailError extends DomainError {}
