import { Notification } from "../../domain/notifications/notification.js";
import type { IdGenerator } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import type {
  Notifier,
  NotificationRecipient,
  NotificationRepository,
  NotificationSpec,
} from "./ports.js";

// 1.7a: raises in-app notifications. Builds domain Notifications (id + timestamp
// injected) and persists them — one for notify(), a batch for notifyMany() so a
// fan-out to N recipients is a single round trip.
export class NotificationService implements Notifier {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    await this.repo.save(this.build(recipient, spec));
  }

  async notifyMany(
    recipients: readonly NotificationRecipient[],
    spec: NotificationSpec,
  ): Promise<void> {
    if (recipients.length === 0) {
      return;
    }
    await this.repo.saveMany(recipients.map((recipient) => this.build(recipient, spec)));
  }

  private build(recipient: NotificationRecipient, spec: NotificationSpec): Notification {
    return Notification.create({
      id: this.ids.nextId(),
      recipientKind: recipient.kind,
      recipientId: recipient.id,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      now: this.clock.now(),
    });
  }
}
