import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module.js";
import { NotifyDueFollowUps } from "../../src/application/notifications/notify-due-follow-ups.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import {
  DEFAULT_TENANT_ID,
  TenantContext,
} from "../../src/infrastructure/tenancy/tenant-context.js";

// 1.7d: the scheduled follow-up reminder against real Postgres — including the
// property the schedule depends on: a repeated scan must NOT re-announce.
describe("Follow-up due scan (integration, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scan: NotifyDueFollowUps;
  const followUpIds: string[] = [];
  const investorId = `inv-fu-${randomUUID()}`;

  const seedFollowUp = async (dueAt: Date, state = "open"): Promise<string> => {
    const id = `fu-${randomUUID()}`;
    followUpIds.push(id);
    await prisma.crmFollowUp.create({
      data: {
        id,
        tenantId: DEFAULT_TENANT_ID,
        investorId,
        text: `chase ${id}`,
        dueAt,
        state,
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    });
    return id;
  };

  const notices = async (): Promise<number> =>
    prisma.notification.count({ where: { type: "crm.follow_up_due" } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // StaffBootstrap seeds officer-1 (super_admin → holds crm.manage)
    prisma = app.get(PrismaService);
    scan = app.get(NotifyDueFollowUps);
    await prisma.notification.deleteMany({ where: { type: "crm.follow_up_due" } });
  }, 30_000);

  afterAll(async () => {
    await prisma.crmFollowUp.deleteMany({ where: { id: { in: followUpIds } } });
    await prisma.notification.deleteMany({ where: { type: "crm.follow_up_due" } });
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("announces an overdue follow-up exactly once across repeated scans", async () => {
    // The dev database holds unrelated follow-ups, so assertions are scoped to
    // these rows and to the DELTA a rescan produces — never to global counts.
    const overdue = await seedFollowUp(new Date("2026-01-01T00:00:00Z"));
    const notDue = await seedFollowUp(new Date("2099-01-01T00:00:00Z"));
    const completed = await seedFollowUp(new Date("2026-01-01T00:00:00Z"), "done");

    const first = await TenantContext.run(DEFAULT_TENANT_ID, () => scan.execute());
    expect(first.announced).toBeGreaterThanOrEqual(1);
    expect(await notices()).toBeGreaterThanOrEqual(1);

    // Only the overdue, still-open one is marked.
    const marked = async (id: string): Promise<Date | null> =>
      (await prisma.crmFollowUp.findUnique({ where: { id } }))?.dueNotifiedAt ?? null;
    expect(await marked(overdue)).not.toBeNull();
    expect(await marked(notDue)).toBeNull();
    expect(await marked(completed)).toBeNull();

    // The next run of the SAME schedule announces nothing new — the property the
    // whole recurring job depends on.
    const before = await notices();
    const second = await TenantContext.run(DEFAULT_TENANT_ID, () => scan.execute());
    expect(second).toEqual({ scanned: 0, announced: 0 });
    expect(await notices()).toBe(before);
  });
});
