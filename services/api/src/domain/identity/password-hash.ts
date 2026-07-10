import { InvalidPasswordHashError } from "./errors.js";

// Opaque digest produced by the application-layer PasswordHasher port; the
// domain never sees plaintext passwords.
export class PasswordHash {
  private constructor(public readonly value: string) {}

  static of(raw: string): PasswordHash {
    if (raw.trim() === "") {
      throw new InvalidPasswordHashError("a password hash must be a non-empty string");
    }
    return new PasswordHash(raw);
  }
}
