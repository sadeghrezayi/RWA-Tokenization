import { InvalidNotificationError } from "./errors.js";

// Who a notification is addressed to. Staff and investors live in different
// tables/identity spaces, so the kind disambiguates the id.
export type RecipientKind = "staff" | "investor";

export interface NotificationSnapshot {
  id: string;
  recipientKind: RecipientKind;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  createdAt: Date;
  readAt?: Date;
}

// 1.7: a single in-app notification addressed to one recipient. The only
// behaviour is the read transition (idempotent), plus construction validation —
// everything else is data. Framework-free.
export class Notification {
  private constructor(
    public readonly id: string,
    public readonly recipientKind: RecipientKind,
    public readonly recipientId: string,
    public readonly type: string,
    public readonly title: string,
    public readonly body: string,
    public readonly createdAt: Date,
    public readonly readAt?: Date,
  ) {}

  static create(input: {
    id: string;
    recipientKind: RecipientKind;
    recipientId: string;
    type: string;
    title: string;
    body: string;
    now: Date;
  }): Notification {
    const required: Record<string, string> = {
      id: input.id,
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
    };
    for (const [field, value] of Object.entries(required)) {
      if (value.trim() === "") {
        throw new InvalidNotificationError(`${field} must not be empty`);
      }
    }
    return new Notification(
      input.id,
      input.recipientKind,
      input.recipientId,
      input.type,
      input.title,
      input.body,
      input.now,
    );
  }

  static restore(s: NotificationSnapshot): Notification {
    return new Notification(
      s.id,
      s.recipientKind,
      s.recipientId,
      s.type,
      s.title,
      s.body,
      s.createdAt,
      s.readAt,
    );
  }

  get isRead(): boolean {
    return this.readAt !== undefined;
  }

  // Idempotent: reading an already-read notification keeps the first read time.
  markRead(now: Date): Notification {
    if (this.readAt !== undefined) {
      return this;
    }
    return new Notification(
      this.id,
      this.recipientKind,
      this.recipientId,
      this.type,
      this.title,
      this.body,
      this.createdAt,
      now,
    );
  }
}
