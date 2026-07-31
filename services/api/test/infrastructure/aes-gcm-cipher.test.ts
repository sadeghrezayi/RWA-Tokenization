import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AesGcmCipher,
  InvalidEncryptionKeyError,
} from "../../src/infrastructure/crypto/aes-gcm-cipher.js";
import { flipByte } from "../fakes/bytes.js";

const key = () => randomBytes(32);
const plaintext = Buffer.from("passport scan bytes — personal data", "utf8");

describe("AesGcmCipher", () => {
  it("round-trips content", () => {
    const cipher = new AesGcmCipher(key());
    expect(cipher.decrypt(cipher.encrypt(plaintext)).equals(plaintext)).toBe(true);
  });

  it("produces different ciphertext each time for identical input", () => {
    // A fresh IV per encryption: identical documents must not be linkable by
    // comparing stored bytes.
    const cipher = new AesGcmCipher(key());
    const a = cipher.encrypt(plaintext);
    const b = cipher.encrypt(plaintext);

    expect(a.equals(b)).toBe(false);
    expect(cipher.decrypt(a).equals(cipher.decrypt(b))).toBe(true);
  });

  it("refuses content that was tampered with", () => {
    // GCM authenticates: a flipped byte must fail loudly, never decrypt to
    // something plausible.
    const cipher = new AesGcmCipher(key());
    const sealed = cipher.encrypt(plaintext);
    const tampered = flipByte(sealed, sealed.length - 1);

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("refuses content whose authentication tag was tampered with", () => {
    const cipher = new AesGcmCipher(key());
    const sealed = cipher.encrypt(plaintext);
    const tampered = flipByte(sealed, 13); // inside the tag region

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("cannot be decrypted with a different key", () => {
    const sealed = new AesGcmCipher(key()).encrypt(plaintext);
    expect(() => new AesGcmCipher(key()).decrypt(sealed)).toThrow();
  });

  it("rejects a key that is not 256 bits", () => {
    // A short key would silently weaken every document at rest.
    expect(() => new AesGcmCipher(randomBytes(16))).toThrow(InvalidEncryptionKeyError);
    expect(() => new AesGcmCipher(randomBytes(31))).toThrow(InvalidEncryptionKeyError);
  });

  it("rejects a sealed blob that is too short to contain iv+tag", () => {
    const cipher = new AesGcmCipher(key());
    expect(() => cipher.decrypt(Buffer.alloc(8))).toThrow();
  });

  it("handles empty content without leaking it as plaintext", () => {
    const cipher = new AesGcmCipher(key());
    const sealed = cipher.encrypt(Buffer.alloc(0));

    expect(sealed.length).toBeGreaterThan(0); // iv + tag still present
    expect(cipher.decrypt(sealed).length).toBe(0);
  });

  it("builds a key from a hex or base64 secret, rejecting a wrong-sized one", () => {
    const raw = randomBytes(32);
    expect(AesGcmCipher.keyFromSecret(raw.toString("hex")).equals(raw)).toBe(true);
    expect(AesGcmCipher.keyFromSecret(raw.toString("base64")).equals(raw)).toBe(true);
    expect(() => AesGcmCipher.keyFromSecret("too-short")).toThrow(InvalidEncryptionKeyError);
  });
});
