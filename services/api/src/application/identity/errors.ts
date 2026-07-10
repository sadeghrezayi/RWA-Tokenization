export abstract class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvestorNotFoundError extends ApplicationError {
  constructor(investorId: string) {
    super(`no investor found with id "${investorId}"`);
  }
}

export class EmailAlreadyRegisteredError extends ApplicationError {
  constructor() {
    super("an investor with this email address is already registered");
  }
}
