import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class InvalidEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEncryptionKeyError";
  }
}

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;

// 2.3b: authenticated encryption for personal data at rest.
//
// AES-256-GCM, not plain AES: GCM AUTHENTICATES as well as encrypts, so a
// tampered document fails loudly instead of decrypting into something
// plausible. That matters for identity evidence — a silently corrupted passport
// scan shown to a reviewer would be worse than an error.
//
// A fresh random IV per encryption means two identical documents produce
// different stored bytes, so they cannot be linked by comparison at rest.
//
// Sealed layout: [iv (12) | tag (16) | ciphertext].
//
// SCOPE LIMIT — key management is NOT solved here. The key arrives from
// configuration; rotation, escrow and HSM/KMS custody remain outstanding
// (OD-16) and require an operational decision before production use.
export class AesGcmCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new InvalidEncryptionKeyError(
        `encryption key must be ${String(KEY_BYTES)} bytes (AES-256), got ${String(key.length)}`,
      );
    }
  }

  // Accepts hex or base64 so operators are not forced into one encoding. The
  // length check is the real guard — a short secret would silently weaken every
  // document at rest, so it is refused rather than padded or hashed.
  static keyFromSecret(secret: string): Buffer {
    for (const encoding of ["hex", "base64"] as const) {
      const decoded = Buffer.from(secret, encoding);
      if (decoded.length === KEY_BYTES) {
        return decoded;
      }
    }
    throw new InvalidEncryptionKeyError(
      `encryption secret must decode to ${String(KEY_BYTES)} bytes from hex or base64`,
    );
  }

  encrypt(plaintext: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(sealed: Buffer): Buffer {
    if (sealed.length < IV_BYTES + TAG_BYTES) {
      throw new Error("sealed content is too short to be valid");
    }
    const iv = sealed.subarray(0, IV_BYTES);
    const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = sealed.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    // final() throws if the tag does not verify — that is the tamper check.
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
