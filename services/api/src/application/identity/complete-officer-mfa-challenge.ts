import { InvalidMfaChallengeError, InvalidMfaCodeError } from "./errors.js";
import type { MfaChallengeIssuer, MfaStore, TokenIssuer, TotpService } from "./ports.js";
import { hashToken } from "./token-hash.js";

// T1/T4 MFA — login step 2. Redeems a valid challenge (from the password step)
// plus either a live TOTP code OR a single-use recovery code, and issues the
// officer session. Recovery codes are consumed on use.
export class CompleteOfficerMfaChallenge {
  constructor(
    private readonly challenge: MfaChallengeIssuer,
    private readonly store: MfaStore,
    private readonly totp: TotpService,
    private readonly tokens: TokenIssuer,
  ) {}

  async execute(input: { challengeToken: string; code: string }): Promise<{ token: string }> {
    const principalId = await this.challenge.verify(input.challengeToken);
    if (principalId === undefined) {
      throw new InvalidMfaChallengeError();
    }

    const enrollment = await this.store.load(principalId);
    if (enrollment?.status !== "active") {
      // Challenge was valid but MFA is no longer active — restart the login.
      throw new InvalidMfaChallengeError();
    }

    if (await this.totp.verify(enrollment.secret, input.code)) {
      return { token: await this.issueSession(principalId) };
    }

    // Fall back to a single-use recovery code.
    const codeHash = hashToken(input.code);
    if (enrollment.recoveryCodeHashes.includes(codeHash)) {
      await this.store.save(principalId, {
        secret: enrollment.secret,
        status: enrollment.status,
        recoveryCodeHashes: enrollment.recoveryCodeHashes.filter((h) => h !== codeHash),
      });
      return { token: await this.issueSession(principalId) };
    }

    throw new InvalidMfaCodeError();
  }

  private issueSession(officerId: string): Promise<string> {
    return this.tokens.issue({ kind: "officer", officerId });
  }
}
