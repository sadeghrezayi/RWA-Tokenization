import { describe, expect, it } from "vitest";
import { DrainOutbox } from "../../../src/application/outbox/drain-outbox.js";
import type {
  NewOutboxMessage,
  OutboxHandler,
  OutboxMessage,
  OutboxStore,
} from "../../../src/application/outbox/ports.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const NOW = new Date("2026-07-26T10:00:00Z");
const VISIBILITY_MS = 30_000;

// In-memory outbox that mirrors the durability contract the Prisma adapter must
// honour: claimDue increments attempts and pushes availableAt forward by a
// visibility window (so a crashed drain re-surfaces the row, and two drainers
// never take the same one), returning post-claim snapshots.
class InMemoryOutbox implements OutboxStore {
  readonly rows: OutboxMessage[] = [];
  private seq = 0;

  enqueue(message: NewOutboxMessage): Promise<void> {
    this.seq += 1;
    this.rows.push({
      id: `ob-${String(this.seq)}`,
      type: message.type,
      payload: message.payload,
      status: "pending",
      attempts: 0,
      availableAt: new Date(0), // due immediately
      createdAt: NOW,
    });
    return Promise.resolve();
  }

  claimDue(now: Date, limit: number): Promise<OutboxMessage[]> {
    const due = this.rows
      .filter((r) => r.status === "pending" && r.availableAt.getTime() <= now.getTime())
      .slice(0, limit);
    for (const row of due) {
      row.attempts += 1;
      row.availableAt = new Date(now.getTime() + VISIBILITY_MS);
    }
    return Promise.resolve(due.map((r) => ({ ...r })));
  }

  markSent(id: string, at: Date): Promise<void> {
    this.patch(id, { status: "sent", availableAt: at });
    return Promise.resolve();
  }

  reschedule(id: string, availableAt: Date, error: string): Promise<void> {
    this.patch(id, { status: "pending", availableAt, lastError: error });
    return Promise.resolve();
  }

  markDead(id: string, at: Date, error: string): Promise<void> {
    this.patch(id, { status: "dead", availableAt: at, lastError: error });
    return Promise.resolve();
  }

  private patch(id: string, fields: Partial<OutboxMessage>): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, fields);
  }
}

class RecordingHandler implements OutboxHandler {
  readonly handled: Record<string, unknown>[] = [];
  constructor(readonly type: string) {}
  handle(payload: Record<string, unknown>): Promise<void> {
    this.handled.push(payload);
    return Promise.resolve();
  }
}

class ThrowingHandler implements OutboxHandler {
  calls = 0;
  constructor(
    readonly type: string,
    private readonly message = "handler boom",
  ) {}
  handle(): Promise<void> {
    this.calls += 1;
    return Promise.reject(new Error(this.message));
  }
}

describe("DrainOutbox", () => {
  it("dispatches a due message to its handler and marks it sent", async () => {
    const store = new InMemoryOutbox();
    const handler = new RecordingHandler("email.test");
    await store.enqueue({ type: "email.test", payload: { to: "a@b.co", token: "t1" } });
    const drain = new DrainOutbox(store, [handler], new FixedClock(NOW));

    const summary = await drain.drain();

    expect(handler.handled).toEqual([{ to: "a@b.co", token: "t1" }]);
    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, dead: 0 });
    expect(store.rows[0]?.status).toBe("sent");
    expect(store.rows[0]?.attempts).toBe(1);
  });

  it("reschedules a failing message with backoff, keeping it pending", async () => {
    const store = new InMemoryOutbox();
    const handler = new ThrowingHandler("email.test");
    await store.enqueue({ type: "email.test", payload: {} });
    const backoff = (attempts: number): number => attempts * 100; // deterministic
    const drain = new DrainOutbox(store, [handler], new FixedClock(NOW), 3, backoff);

    const summary = await drain.drain();

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 1, dead: 0 });
    const row = store.rows[0];
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("handler boom");
    // availableAt pushed to now + backoff(1) = now + 100s
    expect(row?.availableAt.getTime()).toBe(NOW.getTime() + 100_000);
  });

  it("dead-letters after the max attempts is reached", async () => {
    const store = new InMemoryOutbox();
    const handler = new ThrowingHandler("email.test");
    await store.enqueue({ type: "email.test", payload: {} });
    // backoff 0 so the rescheduled row is immediately due again at the same NOW.
    const drain = new DrainOutbox(store, [handler], new FixedClock(NOW), 3, () => 0);

    const first = await drain.drain(); // attempts=1 -> retry
    const second = await drain.drain(); // attempts=2 -> retry
    const third = await drain.drain(); // attempts=3 == max -> dead

    expect(first.retried).toBe(1);
    expect(second.retried).toBe(1);
    expect(third).toEqual({ claimed: 1, sent: 0, retried: 0, dead: 1 });
    expect(handler.calls).toBe(3);
    expect(store.rows[0]?.status).toBe("dead");
    expect(store.rows[0]?.attempts).toBe(3);
  });

  it("does not re-claim a message whose backoff is still in the future", async () => {
    const store = new InMemoryOutbox();
    const handler = new ThrowingHandler("email.test");
    await store.enqueue({ type: "email.test", payload: {} });
    const drain = new DrainOutbox(store, [handler], new FixedClock(NOW), 5, () => 3600);

    const first = await drain.drain(); // reschedules to now + 1h
    const second = await drain.drain(); // nothing due now

    expect(first.retried).toBe(1);
    expect(second).toEqual({ claimed: 0, sent: 0, retried: 0, dead: 0 });
    expect(handler.calls).toBe(1);
  });

  it("dead-letters a message with no registered handler", async () => {
    const store = new InMemoryOutbox();
    await store.enqueue({ type: "email.unknown", payload: {} });
    const drain = new DrainOutbox(store, [], new FixedClock(NOW), 1);

    const summary = await drain.drain();

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, dead: 1 });
    expect(store.rows[0]?.status).toBe("dead");
    expect(store.rows[0]?.lastError).toContain(
      'no outbox handler registered for type "email.unknown"',
    );
  });

  it("respects the claim limit and only drains due messages", async () => {
    const store = new InMemoryOutbox();
    const handler = new RecordingHandler("email.test");
    await store.enqueue({ type: "email.test", payload: { n: 1 } });
    await store.enqueue({ type: "email.test", payload: { n: 2 } });
    await store.enqueue({ type: "email.test", payload: { n: 3 } });
    const drain = new DrainOutbox(store, [handler], new FixedClock(NOW));

    const summary = await drain.drain(2);

    expect(summary.claimed).toBe(2);
    expect(summary.sent).toBe(2);
    expect(handler.handled).toHaveLength(2);
    expect(store.rows.filter((r) => r.status === "sent")).toHaveLength(2);
    expect(store.rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });
});
