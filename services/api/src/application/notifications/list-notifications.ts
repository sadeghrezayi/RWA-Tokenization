import type { RecipientKind } from "../../domain/notifications/notification.js";
import type { NotificationRepository } from "./ports.js";

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string; // ISO-8601
}

const DEFAULT_LIMIT = 50;

// 1.7a read model: a recipient's own notifications, newest first.
export class ListNotifications {
  constructor(private readonly repo: NotificationRepository) {}

  async forRecipient(
    kind: RecipientKind,
    recipientId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<NotificationView[]> {
    const items = await this.repo.listForRecipient(kind, recipientId, limit);
    return items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));
  }
}
