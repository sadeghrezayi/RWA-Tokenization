import type { PrismaClient } from "@prisma/client";
import {
  Notification,
  type NotificationSnapshot,
  type RecipientKind,
} from "../../domain/notifications/notification.js";
import type { NotificationRepository } from "../../application/notifications/ports.js";

interface NotificationRow {
  id: string;
  recipientKind: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

// 1.7b: tenant-scoped notifications. The proxy forbids update/upsert, so save()
// updates the read flag by id (updateMany) and falls back to create when the row
// is new — one method serving both the emit and mark-read paths.
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(n: Notification): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: { id: n.id },
      data: { readAt: n.readAt ?? null },
    });
    if (updated.count === 0) {
      await this.prisma.notification.create({ data: this.toRow(n) });
    }
  }

  async saveMany(ns: readonly Notification[]): Promise<void> {
    if (ns.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({ data: ns.map((n) => this.toRow(n)) });
  }

  async listForRecipient(
    kind: RecipientKind,
    recipientId: string,
    limit: number,
  ): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientKind: kind, recipientId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => this.toNotification(row));
  }

  async findForRecipient(
    id: string,
    kind: RecipientKind,
    recipientId: string,
  ): Promise<Notification | undefined> {
    const row = await this.prisma.notification.findFirst({
      where: { id, recipientKind: kind, recipientId },
    });
    return row ? this.toNotification(row) : undefined;
  }

  unreadCount(kind: RecipientKind, recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientKind: kind, recipientId, readAt: null },
    });
  }

  async markAllRead(kind: RecipientKind, recipientId: string, at: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientKind: kind, recipientId, readAt: null },
      data: { readAt: at },
    });
    return result.count;
  }

  private toRow(n: Notification): NotificationRow {
    return {
      id: n.id,
      recipientKind: n.recipientKind,
      recipientId: n.recipientId,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt ?? null,
      createdAt: n.createdAt,
    };
  }

  private toNotification(row: NotificationRow): Notification {
    const snapshot: NotificationSnapshot = {
      id: row.id,
      recipientKind: row.recipientKind as RecipientKind,
      recipientId: row.recipientId,
      type: row.type,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
    };
    return Notification.restore(
      row.readAt === null ? snapshot : { ...snapshot, readAt: row.readAt },
    );
  }
}
