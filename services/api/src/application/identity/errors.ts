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

// T4: too many failed logins — the account is temporarily locked. Carries the
// cooldown so the HTTP layer can set Retry-After and return 429.
export class AccountLockedError extends ApplicationError {
  constructor(public readonly retryAfterSeconds: number) {
    super("too many failed login attempts — try again later");
  }
}

// Too many auth requests from one source in a short window (edge rate limit).
export class TooManyRequestsError extends ApplicationError {
  constructor(public readonly retryAfterSeconds: number) {
    super("too many requests — slow down and try again shortly");
  }
}

// Password-reset token was unknown, already used, or expired. One error for all
// three so a caller cannot probe which tokens ever existed (no enumeration).
export class InvalidResetTokenError extends ApplicationError {
  constructor() {
    super("this reset link is invalid or has expired — request a new one");
  }
}

// Email-verification token was unknown, already used, or expired. Same
// no-enumeration rationale as the reset token.
export class InvalidVerificationTokenError extends ApplicationError {
  constructor() {
    super("this verification link is invalid or has expired — request a new one");
  }
}

// --- T1/T4 MFA ---

// Tried to start enrollment while MFA is already active.
export class MfaAlreadyEnrolledError extends ApplicationError {
  constructor() {
    super("multi-factor authentication is already enabled");
  }
}

// Tried to confirm/disable/challenge without an enrollment in the right state.
export class MfaNotEnrolledError extends ApplicationError {
  constructor() {
    super("no multi-factor enrollment is in progress");
  }
}

// The submitted 6-digit code (or recovery code) did not match.
export class InvalidMfaCodeError extends ApplicationError {
  constructor() {
    super("that verification code is incorrect or has expired");
  }
}

// The MFA challenge token from the password step was missing, invalid, or
// expired — the officer must restart the login.
export class InvalidMfaChallengeError extends ApplicationError {
  constructor() {
    super("your sign-in session expired — please log in again");
  }
}
