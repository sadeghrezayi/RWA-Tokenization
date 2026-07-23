import { createHash } from "node:crypto";

// Reset tokens are single-use secrets mailed to the investor. We persist only
// their SHA-256 digest, so a database read never yields a usable token (T14).
// The raw token is high-entropy (see TokenGenerator adapter), so a plain hash
// with no salt is appropriate and lets us look up by digest.
export const hashResetToken = (raw: string): string =>
  createHash("sha256").update(raw, "utf8").digest("hex");
