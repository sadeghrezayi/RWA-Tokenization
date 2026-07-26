import { describe, expect, it } from "vitest";
import { Notification } from "../../../src/domain/notifications/notification.js";
import { InvalidNotificationError } from "../../../src/domain/notifications/errors.js";

const NOW = new Date("2026-07-26T10:00:00Z");

const make = (overrides: Partial<Parameters<typeof Notification.create>[0]> = {}): Notification =>
  Notification.create({
    id: "ntf-1",
    recipientKind: "staff",
    recipientId: "officer-2",
    type: "approval.pending",
    title: "Approval needed",
    body: "A ledger credit awaits your review.",
    now: NOW,
    ...overrides,
  });

describe("Notification (domain)", () => {
  it("creates an unread notification", () => {
    const n = make();
    expect(n.id).toBe("ntf-1");
    expect(n.recipientKind).toBe("staff");
    expect(n.recipientId).toBe("officer-2");
    expect(n.type).toBe("approval.pending");
    expect(n.isRead).toBe(false);
    expect(n.createdAt).toEqual(NOW);
  });

  it.each(["id", "recipientId", "type", "title"] as const)("rejects a blank %s", (field) => {
    expect(() => make({ [field]: "  " })).toThrow(InvalidNotificationError);
  });

  it("marks read, stamping the read time", () => {
    const readAt = new Date("2026-07-26T11:00:00Z");
    const read = make().markRead(readAt);
    expect(read.isRead).toBe(true);
    expect(read.readAt).toEqual(readAt);
  });

  it("is idempotent when already read (keeps the first read time)", () => {
    const first = new Date("2026-07-26T11:00:00Z");
    const later = new Date("2026-07-26T12:00:00Z");
    const read = make().markRead(first);
    const again = read.markRead(later);
    expect(again.readAt).toEqual(first);
    expect(again).toBe(read); // no new object
  });

  it("round-trips through restore", () => {
    const snapshot = {
      id: "ntf-9",
      recipientKind: "investor" as const,
      recipientId: "inv-3",
      type: "kyc.decided",
      title: "KYC approved",
      body: "Your account is verified.",
      createdAt: NOW,
      readAt: new Date("2026-07-26T13:00:00Z"),
    };
    const n = Notification.restore(snapshot);
    expect(n.isRead).toBe(true);
    expect(n.recipientKind).toBe("investor");
    expect(n.readAt).toEqual(snapshot.readAt);
  });
});
