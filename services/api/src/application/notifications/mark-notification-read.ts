import type { RecipientKind } from "../../domain/notifications/notification.js";
import type { Clock } from "../offerings/ports.js";
import { NotificationNotFoundError } from "./errors.js";
import type { NotificationRepository } from "./ports.js";

// 1.7a: mark one (recipient-scoped) or all of a recipient's notifications read.
export class MarkNotificationRead {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async one(id: string, kind: RecipientKind, recipientId: string): Promise<void> {
    const notification = await this.repo.findForRecipient(id, kind, recipientId);
    if (!notification) {
      throw new NotificationNotFoundError(id);
    }
    await this.repo.save(notification.markRead(this.clock.now()));
  }

  async all(kind: RecipientKind, recipientId: string): Promise<void> {
    await this.repo.markAllRead(kind, recipientId, this.clock.now());
  }
}
