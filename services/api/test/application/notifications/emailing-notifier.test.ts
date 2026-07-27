import { describe, expect, it } from "vitest";
import { EmailingNotifier } from "../../../src/application/notifications/emailing-notifier.js";
import { NOTIFICATION_EMAIL_TYPE } from "../../../src/application/notifications/notification-email.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../../src/application/notifications/ports.js";
import type { NewOutboxMessage, OutboxEnqueue } from "../../../src/application/outbox/ports.js";

class RecordingInner implements Notifier {
  readonly calls: { recipients: NotificationRecipient[]; spec: NotificationSpec }[] = [];
  notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [recipient], spec });
    return Promise.resolve();
  }
  notifyMany(recipients: readonly NotificationRecipient[], spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [...recipients], spec });
    return Promise.resolve();
  }
}

class RecordingOutbox implements OutboxEnqueue {
  readonly messages: NewOutboxMessage[] = [];
  enqueue(message: NewOutboxMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}

const setup = () => {
  const inner = new RecordingInner();
  const outbox = new RecordingOutbox();
  return { inner, outbox, notifier: new EmailingNotifier(inner, outbox) };
};

const important: NotificationSpec = {
  type: "kyc.decided",
  title: "KYC approved",
  body: "Your account is verified.",
  important: true,
};

describe("EmailingNotifier", () => {
  it("always delegates the in-app notification to the inner notifier", async () => {
    const s = setup();
    await s.notifier.notify({ kind: "investor", id: "inv-1", email: "a@b.co" }, important);
    expect(s.inner.calls).toHaveLength(1);
    expect(s.inner.calls[0]?.recipients[0]?.id).toBe("inv-1");
  });

  it("queues an email for an important notification with a known address", async () => {
    const s = setup();
    await s.notifier.notify({ kind: "investor", id: "inv-1", email: "a@b.co" }, important);
    expect(s.outbox.messages).toEqual([
      {
        type: NOTIFICATION_EMAIL_TYPE,
        payload: { to: "a@b.co", title: "KYC approved", body: "Your account is verified." },
      },
    ]);
  });

  it("does not email a notification that is not marked important", async () => {
    const s = setup();
    await s.notifier.notify(
      { kind: "investor", id: "inv-1", email: "a@b.co" },
      { type: "distribution.paid", title: "Paid", body: "x" },
    );
    expect(s.inner.calls).toHaveLength(1); // still in-app
    expect(s.outbox.messages).toHaveLength(0);
  });

  it("does not email when the recipient has no known address", async () => {
    const s = setup();
    await s.notifier.notify({ kind: "staff", id: "officer-1" }, important);
    expect(s.inner.calls).toHaveLength(1);
    expect(s.outbox.messages).toHaveLength(0);
  });

  it("queues one email per addressable recipient on a fan-out", async () => {
    const s = setup();
    await s.notifier.notifyMany(
      [
        { kind: "staff", id: "officer-1", email: "one@platform.local" },
        { kind: "staff", id: "officer-2" }, // no address → in-app only
        { kind: "staff", id: "officer-3", email: "three@platform.local" },
      ],
      important,
    );
    expect(s.inner.calls[0]?.recipients).toHaveLength(3); // all three in-app
    expect(s.outbox.messages.map((m) => (m.payload as { to: string }).to)).toEqual([
      "one@platform.local",
      "three@platform.local",
    ]);
  });
});
