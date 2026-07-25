import { EmailAddress } from "../../domain/identity/email-address.js";
import { InvalidCredentialsError } from "./errors.js";
import type {
  MfaChallengeIssuer,
  MfaStore,
  PasswordHasher,
  StaffUserRepository,
  TokenIssuer,
} from "./ports.js";

// Two-step outcome (T1/T4): a correct password yields a session immediately, or
// — when the staff user has active MFA — an "mfa_required" challenge that must
// be completed for a session.
export type StaffAuthResult =
  { status: "authenticated"; token: string } | { status: "mfa_required"; challengeToken: string };

// 1.4c: staff login against real User rows (replacing the single env officer).
// The issued token carries the user's id and roles, so the authorization layer
// grants exactly that user's permissions.
export class AuthenticateStaff {
  constructor(
    private readonly users: StaffUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly mfa: MfaStore,
    private readonly challenge: MfaChallengeIssuer,
  ) {}

  async execute(input: { email: string; password: string }): Promise<StaffAuthResult> {
    let email: EmailAddress;
    try {
      email = EmailAddress.of(input.email);
    } catch {
      throw new InvalidCredentialsError(); // malformed email → same generic error
    }

    const user = await this.users.findByEmail(email);
    if (
      !user ||
      !user.isActive() ||
      !(await this.hasher.verify(input.password, user.passwordHash.value))
    ) {
      throw new InvalidCredentialsError();
    }

    const enrollment = await this.mfa.load(user.id);
    if (enrollment?.status === "active") {
      return { status: "mfa_required", challengeToken: await this.challenge.issue(user.id) };
    }
    return {
      status: "authenticated",
      token: await this.tokens.issue({ kind: "officer", officerId: user.id, roles: user.roles }),
    };
  }
}
