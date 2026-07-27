import type { OutboxEnqueue } from "../outbox/ports.js";
import { NOTIFICATION_EMAIL_TYPE } from "./notification-email.js";
import type { NotificationRecipient, NotificationSpec, Notifier } from "./ports.js";

// 1.7c-ii: decorates a Notifier so that IMPORTANT notifications are also
// delivered by email — durably and at-least-once through the 1.6b outbox, never
// inline on the request path. Keeping this a decorator leaves NotificationService
// responsible for in-app persistence only (SRP): the in-app notification is
// always raised first, and emailing is a strictly additive concern.
//
// An email goes out only when BOTH hold: the spec is marked important, and the
// recipient's address is known. Everything else stays in-app.
export class EmailingNotifier implements Notifier {
  constructor(
    private readonly inner: Notifier,
    private readonly outbox: OutboxEnqueue,
  ) {}

  async notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    await this.inner.notify(recipient, spec);
    await this.enqueueEmails([recipient], spec);
  }

  async notifyMany(
    recipients: readonly NotificationRecipient[],
    spec: NotificationSpec,
  ): Promise<void> {
    await this.inner.notifyMany(recipients, spec);
    await this.enqueueEmails(recipients, spec);
  }

  private async enqueueEmails(
    recipients: readonly NotificationRecipient[],
    spec: NotificationSpec,
  ): Promise<void> {
    if (spec.important !== true) {
      return;
    }
    for (const recipient of recipients) {
      if (recipient.email === undefined) {
        continue; // no address on file — in-app only
      }
      await this.outbox.enqueue({
        type: NOTIFICATION_EMAIL_TYPE,
        payload: { to: recipient.email, title: spec.title, body: spec.body },
      });
    }
  }
}
