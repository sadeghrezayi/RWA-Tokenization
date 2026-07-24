import { InvalidCredentialsError } from "./errors.js";
import type { MfaChallengeIssuer, MfaStore, PasswordHasher, TokenIssuer } from "./ports.js";

// Walking skeleton: one env-configured compliance officer. A staff-user table
// with per-officer identity arrives together with the FR-RA-2 audit log (1.4).
export interface OfficerCredentials {
  email: string;
  passwordHash: string;
}

// Stable principal id for the single env officer. When staff become real User
// rows (1.4) this becomes the user id; the MFA store is keyed by it either way.
export const OFFICER_PRINCIPAL_ID = "officer-1";

// Two-step outcome (T1/T4): a correct password either yields a session
// immediately, or — when the officer has active MFA — an "mfa_required"
// challenge that must be completed (CompleteOfficerMfaChallenge) for a session.
export type OfficerAuthResult =
  { status: "authenticated"; token: string } | { status: "mfa_required"; challengeToken: string };

export class AuthenticateOfficer {
  constructor(
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly officer: OfficerCredentials,
    private readonly mfa: MfaStore,
    private readonly challenge: MfaChallengeIssuer,
  ) {}

  async execute(input: { email: string; password: string }): Promise<OfficerAuthResult> {
    const matchesEmail = input.email.trim().toLowerCase() === this.officer.email.toLowerCase();
    if (!matchesEmail || !(await this.hasher.verify(input.password, this.officer.passwordHash))) {
      throw new InvalidCredentialsError();
    }

    const enrollment = await this.mfa.load(OFFICER_PRINCIPAL_ID);
    if (enrollment?.status === "active") {
      return {
        status: "mfa_required",
        challengeToken: await this.challenge.issue(OFFICER_PRINCIPAL_ID),
      };
    }
    return {
      status: "authenticated",
      token: await this.tokens.issue({ kind: "officer", officerId: OFFICER_PRINCIPAL_ID }),
    };
  }
}
