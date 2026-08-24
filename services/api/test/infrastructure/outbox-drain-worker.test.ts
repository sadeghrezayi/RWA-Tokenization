import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxDrainWorker } from "../../src/infrastructure/outbox/outbox-drain-worker.js";
import type { DrainOutbox } from "../../src/application/outbox/drain-outbox.js";

// The outbox is the platform's durability mechanism (decision B7): password
// resets, email verifications and important notifications are all ENQUEUED, not
// sent inline. Nothing delivers them until this worker ticks.
//
// It was opt-in via OUTBOX_DRAIN_INTERVAL_MS and the variable was set NOWHERE —
// not in CI, not in .env, not in launch.json. The result was 187 messages
// stranded in the dev database, the oldest six days old, and email verification
// that had never worked outside tests driving the drainer by hand. A durability
// mechanism that is off by default is not one.
describe("OutboxDrainWorker enablement", () => {
  const env = { ...process.env };
  let drained: number;
  let drainer: DrainOutbox;

  beforeEach(() => {
    vi.useFakeTimers();
    drained = 0;
    drainer = {
      drain: async () => {
        drained += 1;
        return Promise.resolve({ claimed: 0, sent: 0, retried: 0, dead: 0 });
      },
    } as unknown as DrainOutbox;
    delete process.env.OUTBOX_DRAIN_INTERVAL_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...env };
  });

  it("RUNS by default, because an undrained outbox delivers nothing", async () => {
    const worker = new OutboxDrainWorker(drainer);
    worker.onModuleInit();

    await vi.advanceTimersByTimeAsync(5_000);
    worker.onModuleDestroy();

    expect(drained).toBeGreaterThan(0);
  });

  it("can still be turned OFF explicitly, so tests drive draining themselves", async () => {
    // The original reason for opt-in was sound — a background timer racing a
    // test is its own problem. It is kept, as an explicit opt-OUT.
    process.env.OUTBOX_DRAIN_INTERVAL_MS = "0";
    const worker = new OutboxDrainWorker(drainer);
    worker.onModuleInit();

    await vi.advanceTimersByTimeAsync(5_000);
    worker.onModuleDestroy();

    expect(drained).toBe(0);
  });

  it("honours an explicit interval", async () => {
    process.env.OUTBOX_DRAIN_INTERVAL_MS = "1000";
    const worker = new OutboxDrainWorker(drainer);
    worker.onModuleInit();

    await vi.advanceTimersByTimeAsync(3_500);
    worker.onModuleDestroy();

    expect(drained).toBe(3);
  });

  it("treats a nonsense interval as OFF rather than guessing a number", async () => {
    // A typo in deployment config must not silently pick an interval nobody
    // chose. Off is visible in the log; a guessed value is not.
    process.env.OUTBOX_DRAIN_INTERVAL_MS = "not-a-number";
    const worker = new OutboxDrainWorker(drainer);
    worker.onModuleInit();

    await vi.advanceTimersByTimeAsync(5_000);
    worker.onModuleDestroy();

    expect(drained).toBe(0);
  });

  it("stops ticking once destroyed", async () => {
    const worker = new OutboxDrainWorker(drainer);
    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(2_000);
    const before = drained;

    worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(drained).toBe(before);
  });
});
