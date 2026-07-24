import { MfaAlreadyEnrolledError } from "./errors.js";
import type { MfaStore, TotpService } from "./ports.js";

// T1/T4 MFA — enrollment step 1. Mints a fresh TOTP secret and parks it as
// "pending" until the officer proves they scanned it (ConfirmMfaEnrollment).
// Restarting while pending simply re-issues a secret; restarting while already
// active is refused (disable first).
export class StartMfaEnrollment {
  constructor(
    private readonly store: MfaStore,
    private readonly totp: TotpService,
  ) {}

  async execute(input: {
    principalId: string;
    accountName: string;
  }): Promise<{ secret: string; keyUri: string }> {
    const existing = await this.store.load(input.principalId);
    if (existing?.status === "active") {
      throw new MfaAlreadyEnrolledError();
    }
    const secret = this.totp.generateSecret();
    await this.store.save(input.principalId, {
      secret,
      status: "pending",
      recoveryCodeHashes: [],
    });
    return { secret, keyUri: this.totp.keyUri(secret, input.accountName) };
  }
}
