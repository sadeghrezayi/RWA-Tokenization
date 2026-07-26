// 1.6b: outbox message types for the auth emails. Shared by the producers (the
// Request* use-cases) and the drainer's handlers so the type string never drifts.
export const EMAIL_OUTBOX_TYPES = {
  passwordReset: "email.password_reset",
  emailVerification: "email.email_verification",
} as const;
