import { randomBytes } from "node:crypto";
import type { RecoveryCodeGenerator } from "../../application/identity/ports.js";

// Human-typeable single-use backup codes: 10 hex chars grouped as "xxxxx-xxxxx"
// (~40 bits each). Shown once at enrollment; only their digests are stored.
export class CryptoRecoveryCodeGenerator implements RecoveryCodeGenerator {
  generate(count: number): string[] {
    return Array.from({ length: count }, () => {
      const hex = randomBytes(5).toString("hex"); // 10 hex chars
      return `${hex.slice(0, 5)}-${hex.slice(5)}`;
    });
  }
}
