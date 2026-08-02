import { randomInt } from "node:crypto";

// The reference is typed by hand into a bank's payment form, often copied off a
// phone screen. Characters that are read wrong when transcribed are simply not
// in the alphabet: no O/0, no I/1/L, no S/5.
export const PAYMENT_REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

const BODY_LENGTH = 8;

// "TP-" so a bank clerk (and the treasury officer reconciling a statement) can
// see at a glance that a payment line belongs to this platform.
export const newPaymentReference = (): string => {
  let body = "";
  for (let index = 0; index < BODY_LENGTH; index += 1) {
    body += PAYMENT_REFERENCE_ALPHABET.charAt(randomInt(PAYMENT_REFERENCE_ALPHABET.length));
  }
  return `TP-${body}`;
};
