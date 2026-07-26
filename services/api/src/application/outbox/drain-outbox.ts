import type { Clock } from "../offerings/ports.js";
import type { OutboxHandler, OutboxStore } from "./ports.js";

// A message that keeps failing is retried this many times before it is parked as
// dead. `attempts` is counted at claim time, so this is the true number of
// delivery attempts made.
export const DEFAULT_MAX_ATTEMPTS = 5;

// Exponential backoff in seconds, keyed by the (1-based) attempt number, capped
// at one hour so a stuck message still gets periodic retries.
export const defaultBackoffSeconds = (attempts: number): number =>
  Math.min(60 * 60, 5 * 2 ** (attempts - 1));

export interface DrainSummary {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
}

// 1.6b drainer: claims a batch of due outbox messages and dispatches each to its
// registered handler. Success marks the message sent; a throw either reschedules
// it with backoff or, once the attempt budget is spent, dead-letters it. Pure of
// I/O beyond the injected store/handlers/clock, so it is unit-tested with fakes.
export class DrainOutbox {
  private readonly handlers: ReadonlyMap<string, OutboxHandler>;

  constructor(
    private readonly store: OutboxStore,
    handlers: readonly OutboxHandler[],
    private readonly clock: Clock,
    private readonly maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    private readonly backoffSeconds: (attempts: number) => number = defaultBackoffSeconds,
  ) {
    this.handlers = new Map(handlers.map((handler) => [handler.type, handler]));
  }

  async drain(limit = 20): Promise<DrainSummary> {
    const now = this.clock.now();
    const due = await this.store.claimDue(now, limit);
    const summary: DrainSummary = { claimed: due.length, sent: 0, retried: 0, dead: 0 };

    for (const message of due) {
      try {
        const handler = this.handlers.get(message.type);
        if (!handler) {
          throw new Error(`no outbox handler registered for type "${message.type}"`);
        }
        await handler.handle(message.payload);
        await this.store.markSent(message.id, now);
        summary.sent += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // `attempts` already includes this claim, so >= max means the budget is
        // spent after this failure.
        if (message.attempts >= this.maxAttempts) {
          await this.store.markDead(message.id, now, reason);
          summary.dead += 1;
        } else {
          const nextAt = new Date(now.getTime() + this.backoffSeconds(message.attempts) * 1000);
          await this.store.reschedule(message.id, nextAt, reason);
          summary.retried += 1;
        }
      }
    }

    return summary;
  }
}
