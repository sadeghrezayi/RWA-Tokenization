import { createHash } from "node:crypto";

// Single-use out-of-band secrets (password-reset, email-verification links) are
// persisted only as their SHA-256 digest, so a database read never yields a
// usable token (T14). The raw tokens are high-entropy (see the TokenGenerator
// adapter), so a plain unsalted hash is appropriate and enables digest lookup.
export const hashToken = (raw: string): string =>
  createHash("sha256").update(raw, "utf8").digest("hex");
