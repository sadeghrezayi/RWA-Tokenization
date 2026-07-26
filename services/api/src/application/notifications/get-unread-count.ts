import type { RecipientKind } from "../../domain/notifications/notification.js";
import type { NotificationRepository } from "./ports.js";

// 1.7a: the unread badge count for a recipient.
export class GetUnreadCount {
  constructor(private readonly repo: NotificationRepository) {}

  forRecipient(kind: RecipientKind, recipientId: string): Promise<number> {
    return this.repo.unreadCount(kind, recipientId);
  }
}
