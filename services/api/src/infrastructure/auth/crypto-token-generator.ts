import { randomBytes } from "node:crypto";
import type { TokenGenerator } from "../../application/identity/ports.js";

// 32 bytes of CSPRNG entropy, URL-safe base64 (no padding) so the raw token
// drops straight into a reset link without escaping.
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }
}
