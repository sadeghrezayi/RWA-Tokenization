// 1.7d: recurring background work. Distinct from the 1.6b outbox, which carries
// side effects of a state change that already happened: these jobs have no
// triggering request at all — they fire because time passed.
//
// The port is deliberately tiny (schedule a named job on a cron, run a handler)
// so the queue technology stays an infrastructure detail.
export interface ScheduledJob {
  // Stable name — the queue uses it to avoid scheduling duplicates.
  name: string;
  // Standard 5-field cron expression.
  cron: string;
  run: () => Promise<void>;
}

export interface JobScheduler {
  // Registers and starts every job. Implementations must be idempotent: a
  // restart re-registers the same names rather than accumulating duplicates.
  start(jobs: readonly ScheduledJob[]): Promise<void>;
  stop(): Promise<void>;
}
