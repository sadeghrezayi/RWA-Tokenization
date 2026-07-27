import type { Notification, RecipientKind } from "../../domain/notifications/notification.js";

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  saveMany(notifications: readonly Notification[]): Promise<void>;
  // A recipient's own notifications, newest first, capped by limit.
  listForRecipient(
    kind: RecipientKind,
    recipientId: string,
    limit: number,
  ): Promise<Notification[]>;
  // Scoped by recipient so one user cannot read/act on another's notification.
  findForRecipient(
    id: string,
    kind: RecipientKind,
    recipientId: string,
  ): Promise<Notification | undefined>;
  unreadCount(kind: RecipientKind, recipientId: string): Promise<number>;
  markAllRead(kind: RecipientKind, recipientId: string, at: Date): Promise<number>;
}

export interface NotificationRecipient {
  kind: RecipientKind;
  id: string;
  // 1.7c-ii: the emitter already holds the recipient's address (it loaded the
  // investor/staff row), so it passes it along rather than making the
  // notification layer re-resolve identities. Absent → in-app only.
  email?: string;
}

export interface NotificationSpec {
  type: string;
  title: string;
  body: string;
  // 1.7c-ii: important notifications are ALSO emailed (durably, via the outbox)
  // so a recipient who is not logged in still finds out. Reserved for
  // time-sensitive or account-critical events; informational ones stay in-app.
  important?: boolean;
}

// What event-emitting use-cases (DecideApproval, KYC decision, distribution
// payout, …) depend on to raise in-app notifications. Implemented by
// NotificationService — keeps emitters free of persistence and id/clock details.
export interface Notifier {
  notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void>;
  notifyMany(recipients: readonly NotificationRecipient[], spec: NotificationSpec): Promise<void>;
}
