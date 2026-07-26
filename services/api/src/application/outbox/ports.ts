// 1.6b — transactional outbox. Producers enqueue a message inside the SAME
// transaction as their state change, so the message is persisted iff that change
// commits (no lost side effects, no phantom sends). A separate drainer performs
// the effect at-least-once with retry/backoff and dead-lettering.

export type OutboxStatus = "pending" | "sent" | "dead";

export interface OutboxMessage {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  // The message is eligible to be claimed once availableAt <= now. Enqueue sets
  // it to "now" (due immediately); a failed attempt pushes it into the future
  // for backoff; a claim pushes it forward by a visibility window.
  availableAt: Date;
  lastError?: string;
  createdAt: Date;
}

export interface NewOutboxMessage {
  type: string;
  payload: Record<string, unknown>;
}

// Producer side. Enqueue is called within the trigger's own transaction.
export interface OutboxEnqueue {
  enqueue(message: NewOutboxMessage): Promise<void>;
}

// Worker side.
export interface OutboxStore extends OutboxEnqueue {
  // Atomically claim up to `limit` due (pending, availableAt <= now) messages:
  // increments attempts and pushes availableAt forward by a visibility window so
  // a crashed drain re-surfaces the row later (at-least-once) and two drainers
  // never take the same row. Returns the post-claim snapshots.
  claimDue(now: Date, limit: number): Promise<OutboxMessage[]>;
  markSent(id: string, at: Date): Promise<void>;
  // Still pending — retry no earlier than `availableAt`.
  reschedule(id: string, availableAt: Date, error: string): Promise<void>;
  // Terminal failure — parked for inspection, never re-claimed.
  markDead(id: string, at: Date, error: string): Promise<void>;
}

// Performs the side effect for one message type. Registered by `type`.
export interface OutboxHandler {
  readonly type: string;
  handle(payload: Record<string, unknown>): Promise<void>;
}
