import { generateSecret, generateURI, verify } from "otplib";
import type { TotpService } from "../../application/identity/ports.js";

// TOTP (RFC 6238) via otplib. The issuer label is what shows in the officer's
// authenticator app. A ±30s epoch tolerance absorbs modest clock drift between
// the server and the phone without materially widening the attack window.
const ISSUER = "Asset Tokenization Platform";
const EPOCH_TOLERANCE_SECONDS = 30;

export class OtplibTotpService implements TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  keyUri(secret: string, accountName: string): string {
    return generateURI({ issuer: ISSUER, label: accountName, secret });
  }

  async verify(secret: string, code: string): Promise<boolean> {
    // otplib throws on a malformed token (non-6-digit / non-numeric). A recovery
    // code is exactly that shape, so a throw here means "not a valid TOTP code" —
    // return false and let the caller fall through to the recovery-code path.
    try {
      const result = await verify({
        secret,
        token: code,
        epochTolerance: EPOCH_TOLERANCE_SECONDS,
      });
      return result.valid;
    } catch {
      return false;
    }
  }
}
