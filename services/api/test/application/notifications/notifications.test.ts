import { describe, expect, it } from "vitest";
import {
  Notification,
  type RecipientKind,
} from "../../../src/domain/notifications/notification.js";
import { NotificationService } from "../../../src/application/notifications/notification-service.js";
import { ListNotifications } from "../../../src/application/notifications/list-notifications.js";
import { GetUnreadCount } from "../../../src/application/notifications/get-unread-count.js";
import { MarkNotificationRead } from "../../../src/application/notifications/mark-notification-read.js";
import { NotificationNotFoundError } from "../../../src/application/notifications/errors.js";
import type { NotificationRepository } from "../../../src/application/notifications/ports.js";
import { SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const NOW = new Date("2026-07-26T10:00:00Z");

class InMemoryNotifications implements NotificationRepository {
  readonly rows: Notification[] = [];
  save(n: Notification): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === n.id);
    if (i >= 0) this.rows[i] = n;
    else this.rows.push(n);
    return Promise.resolve();
  }
  saveMany(ns: readonly Notification[]): Promise<void> {
    this.rows.push(...ns);
    return Promise.resolve();
  }
  listForRecipient(
    kind: RecipientKind,
    recipientId: string,
    limit: number,
  ): Promise<Notification[]> {
    const mine = this.rows
      .filter((r) => r.recipientKind === kind && r.recipientId === recipientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return Promise.resolve(mine);
  }
  findForRecipient(
    id: string,
    kind: RecipientKind,
    recipientId: string,
  ): Promise<Notification | undefined> {
    return Promise.resolve(
      this.rows.find(
        (r) => r.id === id && r.recipientKind === kind && r.recipientId === recipientId,
      ),
    );
  }
  unreadCount(kind: RecipientKind, recipientId: string): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (r) => r.recipientKind === kind && r.recipientId === recipientId && !r.isRead,
      ).length,
    );
  }
  markAllRead(kind: RecipientKind, recipientId: string, at: Date): Promise<number> {
    let n = 0;
    this.rows.forEach((r, i) => {
      if (r.recipientKind === kind && r.recipientId === recipientId && !r.isRead) {
        this.rows[i] = r.markRead(at);
        n += 1;
      }
    });
    return Promise.resolve(n);
  }
}

const setup = () => {
  const repo = new InMemoryNotifications();
  const clock = new FixedClock(NOW);
  return {
    repo,
    clock,
    service: new NotificationService(repo, new SequentialIdGenerator(), clock),
    list: new ListNotifications(repo),
    unread: new GetUnreadCount(repo),
    mark: new MarkNotificationRead(repo, clock),
  };
};

describe("NotificationService", () => {
  const spec = { type: "approval.pending", title: "Approval needed", body: "Review the credit." };

  it("persists a single in-app notification", async () => {
    const s = setup();
    await s.service.notify({ kind: "staff", id: "officer-2" }, spec);
    expect(s.repo.rows).toHaveLength(1);
    expect(s.repo.rows[0]?.recipientId).toBe("officer-2");
    expect(s.repo.rows[0]?.type).toBe("approval.pending");
    expect(s.repo.rows[0]?.isRead).toBe(false);
  });

  it("fans out to many recipients", async () => {
    const s = setup();
    await s.service.notifyMany(
      [
        { kind: "staff", id: "officer-1" },
        { kind: "staff", id: "officer-3" },
      ],
      spec,
    );
    expect(s.repo.rows.map((r) => r.recipientId)).toEqual(["officer-1", "officer-3"]);
  });

  it("no-ops for an empty recipient list", async () => {
    const s = setup();
    await s.service.notifyMany([], spec);
    expect(s.repo.rows).toHaveLength(0);
  });
});

describe("ListNotifications / GetUnreadCount", () => {
  const seed = async (s: ReturnType<typeof setup>) => {
    s.clock.current = new Date("2026-07-26T10:00:00Z");
    await s.service.notify(
      { kind: "investor", id: "inv-1" },
      { type: "a", title: "first", body: "" },
    );
    s.clock.current = new Date("2026-07-26T10:05:00Z");
    await s.service.notify(
      { kind: "investor", id: "inv-1" },
      { type: "b", title: "second", body: "" },
    );
    await s.service.notify(
      { kind: "staff", id: "officer-2" },
      { type: "c", title: "other", body: "" },
    );
  };

  it("lists a recipient's own notifications newest first", async () => {
    const s = setup();
    await seed(s);
    const views = await s.list.forRecipient("investor", "inv-1");
    expect(views.map((v) => v.title)).toEqual(["second", "first"]);
    expect(views.every((v) => !v.read)).toBe(true);
  });

  it("respects the limit", async () => {
    const s = setup();
    await seed(s);
    const views = await s.list.forRecipient("investor", "inv-1", 1);
    expect(views.map((v) => v.title)).toEqual(["second"]);
  });

  it("counts only the recipient's unread notifications", async () => {
    const s = setup();
    await seed(s);
    expect(await s.unread.forRecipient("investor", "inv-1")).toBe(2);
    expect(await s.unread.forRecipient("staff", "officer-2")).toBe(1);
  });
});

describe("MarkNotificationRead", () => {
  it("marks a single notification read for its owner", async () => {
    const s = setup();
    await s.service.notify({ kind: "investor", id: "inv-1" }, { type: "a", title: "t", body: "" });
    const id = s.repo.rows[0]?.id ?? "";

    await s.mark.one(id, "investor", "inv-1");

    expect(s.repo.rows[0]?.isRead).toBe(true);
    expect(await s.unread.forRecipient("investor", "inv-1")).toBe(0);
  });

  it("will not let a different recipient mark it read (not found)", async () => {
    const s = setup();
    await s.service.notify({ kind: "investor", id: "inv-1" }, { type: "a", title: "t", body: "" });
    const id = s.repo.rows[0]?.id ?? "";

    await expect(s.mark.one(id, "investor", "inv-2")).rejects.toThrow(NotificationNotFoundError);
    await expect(s.mark.one(id, "staff", "inv-1")).rejects.toThrow(NotificationNotFoundError);
    expect(s.repo.rows[0]?.isRead).toBe(false);
  });

  it("marks all of a recipient's notifications read", async () => {
    const s = setup();
    await s.service.notify({ kind: "staff", id: "officer-2" }, { type: "a", title: "1", body: "" });
    await s.service.notify({ kind: "staff", id: "officer-2" }, { type: "b", title: "2", body: "" });

    await s.mark.all("staff", "officer-2");

    expect(await s.unread.forRecipient("staff", "officer-2")).toBe(0);
  });
});
