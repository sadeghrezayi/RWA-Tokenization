import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { DrainOutbox } from "../../application/outbox/drain-outbox.js";

// 1.6b: periodically drains the transactional outbox. A single in-flight guard
// prevents a slow drain from overlapping the next tick.
//
// ON BY DEFAULT. It was opt-in via OUTBOX_DRAIN_INTERVAL_MS, and that variable
// was set NOWHERE — not in CI, not in .env, not in launch.json. Since password
// resets, email verifications and important notifications are all ENQUEUED
// rather than sent inline (decision B7), nothing was ever delivered: 187
// messages sat in the dev database, the oldest six days old. A durability
// mechanism that is off unless someone remembers a variable is not one.
//
// The original reason for opt-in was sound — a background timer racing a test
// is its own problem — so it survives as an explicit opt-OUT: set the variable
// to 0 and tests drive draining themselves, which is what the suites do.
// Frequent enough that a password-reset email arrives while the person is still
// looking at the screen, and cheap: a drain with nothing due is one indexed
// query.
const DEFAULT_INTERVAL_MS = 1_000;

@Injectable()
export class OutboxDrainWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxDrainWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;

  constructor(private readonly drainer: DrainOutbox) {}

  onModuleInit(): void {
    const configured = process.env.OUTBOX_DRAIN_INTERVAL_MS;
    // Unset means the default. A value that is set but unusable — 0, or a typo —
    // means OFF, deliberately: silently guessing an interval nobody chose is
    // how a queue quietly stops draining again.
    const intervalMs = configured === undefined ? DEFAULT_INTERVAL_MS : Number(configured);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.log.warn(
        "outbox drain worker DISABLED — queued email and notifications will not be delivered " +
          "(unset OUTBOX_DRAIN_INTERVAL_MS for the default, or set it above 0)",
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    this.log.log(`outbox drain worker started (every ${String(intervalMs)}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      const summary = await this.drainer.drain();
      if (summary.claimed > 0) {
        this.log.log(
          `outbox drained: sent=${String(summary.sent)} retried=${String(summary.retried)} dead=${String(summary.dead)}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log.error(`outbox drain failed: ${reason}`);
    } finally {
      this.inFlight = false;
    }
  }
}
