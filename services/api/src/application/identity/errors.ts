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

export class WeakPasswordError extends ApplicationError {
  constructor(minLength: number) {
    super(`password must be at least ${String(minLength)} characters`);
  }
}

// One error for unknown email AND wrong password — no account enumeration.
export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super("invalid email or password");
  }
}
