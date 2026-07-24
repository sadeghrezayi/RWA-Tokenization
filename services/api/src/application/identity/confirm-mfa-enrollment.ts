import { InvalidMfaCodeError, MfaNotEnrolledError } from "./errors.js";
import type { MfaStore, RecoveryCodeGenerator, TotpService } from "./ports.js";
import { hashToken } from "./token-hash.js";

// How many single-use backup codes are handed out at enrollment.
export const RECOVERY_CODE_COUNT = 10;

// T1/T4 MFA — enrollment step 2. Verifies a live code against the pending
// secret, activates MFA, and returns single-use recovery codes ONCE (only their
// digests are persisted). A wrong code leaves the enrollment pending.
export class ConfirmMfaEnrollment {
  constructor(
    private readonly store: MfaStore,
    private readonly totp: TotpService,
    private readonly recovery: RecoveryCodeGenerator,
  ) {}

  async execute(input: {
    principalId: string;
    code: string;
  }): Promise<{ recoveryCodes: string[] }> {
    const enrollment = await this.store.load(input.principalId);
    if (enrollment?.status !== "pending") {
      throw new MfaNotEnrolledError();
    }
    if (!(await this.totp.verify(enrollment.secret, input.code))) {
      throw new InvalidMfaCodeError();
    }

    const recoveryCodes = this.recovery.generate(RECOVERY_CODE_COUNT);
    await this.store.save(input.principalId, {
      secret: enrollment.secret,
      status: "active",
      recoveryCodeHashes: recoveryCodes.map(hashToken),
    });
    return { recoveryCodes };
  }
}
