import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { JobScheduler, ScheduledJob } from "../../application/jobs/ports.js";
import type { NotifyDueFollowUps } from "../../application/notifications/notify-due-follow-ups.js";
import { DEFAULT_TENANT_ID, TenantContext } from "../tenancy/tenant-context.js";

// Default: every 15 minutes. A follow-up reminder is not urgent to the minute,
// and a modest cadence keeps the scan cheap.
const DEFAULT_FOLLOW_UP_CRON = "*/15 * * * *";

// 1.7d: registers the platform's recurring jobs on startup. Opt-in via
// SCHEDULED_JOBS_ENABLED so tests (and anyone running the API without a job
// runner) drive the scan explicitly instead of racing a background schedule.
@Injectable()
export class ScheduledJobsBootstrap implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ScheduledJobsBootstrap.name);

  constructor(
    private readonly scheduler: JobScheduler,
    private readonly dueFollowUps: NotifyDueFollowUps,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SCHEDULED_JOBS_ENABLED !== "true") {
      this.log.log("scheduled jobs disabled (set SCHEDULED_JOBS_ENABLED=true to enable)");
      return;
    }
    const jobs: ScheduledJob[] = [
      {
        name: "crm.follow-up-due",
        cron: process.env.FOLLOW_UP_DUE_CRON ?? DEFAULT_FOLLOW_UP_CRON,
        // A scheduled job has no HTTP request, so no tenant was resolved by the
        // middleware — the scan runs explicitly against the default tenant.
        // Sweeping every tenant is a multi-tenant-operation concern (OD-1a
        // deferred SaaS ops), not something to guess at here.
        run: async () => {
          const summary = await TenantContext.run(DEFAULT_TENANT_ID, () =>
            this.dueFollowUps.execute(),
          );
          if (summary.announced > 0) {
            this.log.log(`follow-up reminders announced: ${String(summary.announced)}`);
          }
        },
      },
    ];
    await this.scheduler.start(jobs);
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.stop();
  }
}
