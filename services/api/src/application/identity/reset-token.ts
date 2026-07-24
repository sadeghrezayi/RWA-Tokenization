import { hashToken } from "./token-hash.js";

// Password-reset tokens hash with the shared single-use-token digest (T14).
// Kept as a named export so existing call sites read intent at the use site.
export const hashResetToken = hashToken;
