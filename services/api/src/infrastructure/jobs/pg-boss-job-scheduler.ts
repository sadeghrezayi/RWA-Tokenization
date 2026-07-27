import { Logger } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import type { JobScheduler, ScheduledJob } from "../../application/jobs/ports.js";

// 1.7d: pg-boss adapter (OD-3/OD-4). Postgres-backed, so the self-hosted
// deployment gains recurring jobs without Redis or a second datastore. pg-boss
// owns its own schema and migrates itself, which is why it needs no Prisma
// migration of ours.
//
// Cron scheduling is cluster-safe: pg-boss elects a single scheduler across
// instances, so a job fires once per interval no matter how many API processes
// are running — the property an in-process setInterval could never give us.
export class PgBossJobScheduler implements JobScheduler {
  private readonly log = new Logger(PgBossJobScheduler.name);
  private boss: PgBoss | undefined;

  constructor(
    private readonly connectionString: string,
    private readonly schema = "pgboss",
  ) {}

  async start(jobs: readonly ScheduledJob[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    const boss = new PgBoss({ connectionString: this.connectionString, schema: this.schema });
    boss.on("error", (error: Error) => {
      // The queue must never take the API down; a failed poll is retried.
      this.log.error(`pg-boss error: ${error.message}`);
    });
    await boss.start();
    for (const job of jobs) {
      // Idempotent by design: re-creating a queue and re-scheduling the same
      // name on restart replaces the schedule rather than duplicating it.
      await boss.createQueue(job.name);
      await boss.work(job.name, async () => {
        try {
          await job.run();
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.log.error(`scheduled job "${job.name}" failed: ${reason}`);
          throw error; // let pg-boss record the failure and retry per policy
        }
      });
      await boss.schedule(job.name, job.cron);
      this.log.log(`scheduled "${job.name}" (${job.cron})`);
    }
    this.boss = boss;
  }

  async stop(): Promise<void> {
    // Graceful: let an in-flight scan finish rather than tearing it down.
    await this.boss?.stop({ graceful: true });
    this.boss = undefined;
  }
}
