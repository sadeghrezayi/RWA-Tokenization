// 1.7c-ii: outbox message type for "an important notification, also emailed".
// Owned by the notifications module (the identity module owns its own auth-email
// types) so neither module depends on the other's catalog.
export const NOTIFICATION_EMAIL_TYPE = "email.notification";
