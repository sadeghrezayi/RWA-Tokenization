import argon2 from "argon2";
import type { PasswordHasher } from "../../application/identity/ports.js";

// argon2id with the library's current recommended defaults (OWASP first choice).
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    // A malformed stored hash is a failed verification, not a 500.
    return argon2.verify(hash, plain).catch(() => false);
  }
}
