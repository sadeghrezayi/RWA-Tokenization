import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { DrainOutbox } from "../../application/outbox/drain-outbox.js";

// 1.6b: periodically drains the transactional outbox. Opt-in via
// OUTBOX_DRAIN_INTERVAL_MS (> 0) so tests drive draining deterministically
// instead of racing a background timer. A single in-flight guard prevents a slow
// drain from overlapping the next tick.
@Injectable()
export class OutboxDrainWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxDrainWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;

  constructor(private readonly drainer: DrainOutbox) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.OUTBOX_DRAIN_INTERVAL_MS ?? 0);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.log.log("outbox drain worker disabled (set OUTBOX_DRAIN_INTERVAL_MS > 0 to enable)");
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
