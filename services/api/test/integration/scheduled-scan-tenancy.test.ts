import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MissingTenantContextError,
  TenantContext,
} from "../../src/infrastructure/tenancy/tenant-context.js";
import { tenantScopedPrisma } from "../../src/infrastructure/tenancy/tenant-scoped-prisma.js";
import { PrismaFollowUpRepository } from "../../src/infrastructure/persistence/prisma-crm-repositories.js";
import { PrismaStaffUserRepository } from "../../src/infrastructure/persistence/prisma-staff-user-repository.js";
import { NotifyDueFollowUps } from "../../src/application/notifications/notify-due-follow-ups.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../src/application/notifications/ports.js";

// "Multi-tenant scheduled scans are untested" — the backlog's own words.
//
// The scan runs on a cron, so it has no HTTP request and therefore no tenant
// resolved by the middleware. `ScheduledJobsBootstrap` wraps it in an explicit
// TenantContext for the DEFAULT tenant, and its comment records that sweeping
// every tenant is a deferred multi-tenant-operations decision (OD-1a).
//
// That deferral is defensible; what was never proven is that it is CONTAINED.
// These tests pin two things: another tenant's follow-ups are neither scanned
// nor named in anyone's notification, and the wrapper is load-bearing rather
// than decorative — without it the fail-closed proxy refuses, and a scheduled
// job that throws every time it fires is exactly the silence of K-39.
const raw = new PrismaClient();
const scoped = tenantScopedPrisma(raw);

// TWO DEDICATED TENANTS rather than the default one. The first version scanned
// DEFAULT and asserted `scanned === 1`; it saw 4, because other suites leave
// their own follow-ups in the shared default tenant. Absolute counts over a
// tenant this test does not own are not a property of the scan — they are a
// property of whatever else ran first.
const TENANT_A = "sched-a";
const OTHER_TENANT = "sched-other";
const OVERDUE = new Date("2026-08-01T00:00:00.000Z");
const NOW = new Date("2026-08-25T00:00:00.000Z");
const clock = { now: () => NOW };

class RecordingNotifier implements Notifier {
  readonly sent: { recipients: readonly NotificationRecipient[]; spec: NotificationSpec }[] = [];
  notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    this.sent.push({ recipients: [recipient], spec });
    return Promise.resolve();
  }
  notifyMany(recipients: readonly NotificationRecipient[], spec: NotificationSpec): Promise<void> {
    this.sent.push({ recipients, spec });
    return Promise.resolve();
  }
}

const followUp = async (id: string, tenantId: string, investorId: string, text: string) => {
  await raw.crmFollowUp.create({
    data: {
      id,
      tenantId,
      investorId,
      text,
      dueAt: OVERDUE,
      state: "open",
      createdAt: OVERDUE,
    },
  });
};

const investor = async (id: string, tenantId: string) => {
  await raw.investor.create({
    data: {
      id,
      tenantId,
      email: `${id}@sched.example`,
      passwordHash: "x",
      kycState: "approved",
    },
  });
};

// Keyed on the "sched-" prefix, not on tenant: a mis-scoped write lands under
// the DEFAULT tenant, and a tenant-keyed cleanup would leave it to poison the
// next run. (The tenant-isolation suite learned this the hard way.)
const clearFixtures = async (): Promise<void> => {
  await raw.crmFollowUp.deleteMany({ where: { id: { startsWith: "sched-" } } });
  await raw.investor.deleteMany({ where: { id: { startsWith: "sched-" } } });
  await raw.staffMembership.deleteMany({ where: { userId: { startsWith: "sched-" } } });
  await raw.staffUser.deleteMany({ where: { id: { startsWith: "sched-" } } });
};

describe("the scheduled follow-up scan and tenancy (integration, real Postgres)", () => {
  beforeAll(async () => {
    await raw.tenant.createMany({
      data: [
        { id: TENANT_A, name: "Scheduled A" },
        { id: OTHER_TENANT, name: "Scheduled Other" },
      ],
      skipDuplicates: true,
    });
    await clearFixtures();
  });

  afterAll(async () => {
    await clearFixtures();
    await raw.$disconnect();
  });

  beforeEach(async () => {
    await clearFixtures();
    // Staff are PLATFORM-level (not tenant-scoped), so this one person is a
    // candidate recipient regardless of which tenant is being scanned — which
    // is exactly why the follow-up text must not cross.
    await raw.staffUser.create({
      data: { id: "sched-officer", email: "sched-officer@example.com", passwordHash: "x" },
    });
    await raw.staffMembership.create({
      data: { userId: "sched-officer", role: "compliance_analyst" },
    });
    await investor("sched-inv-a", TENANT_A);
    await investor("sched-inv-other", OTHER_TENANT);
    await followUp("sched-fu-a", TENANT_A, "sched-inv-a", "CALL TENANT A");
    await followUp("sched-fu-other", OTHER_TENANT, "sched-inv-other", "SECRET OF THE OTHER TENANT");
  });

  const scan = (notifier: Notifier) =>
    new NotifyDueFollowUps(
      new PrismaFollowUpRepository(scoped),
      new PrismaStaffUserRepository(raw),
      notifier,
      clock,
    );

  it("announces only the scanned tenant's follow-ups", async () => {
    const notifier = new RecordingNotifier();

    const summary = await TenantContext.run(TENANT_A, () => scan(notifier).execute());

    // The other tenant's overdue follow-up is not even counted as scanned.
    expect(summary.scanned).toBe(1);
    expect(summary.announced).toBe(1);
  });

  it("never puts another tenant's follow-up text in a notification", async () => {
    // The leak that would matter: the reminder body quotes the follow-up, and
    // staff are platform-level, so a scan that ignored tenancy would hand one
    // tenant's private note to whoever can act on CRM.
    const notifier = new RecordingNotifier();

    await TenantContext.run(TENANT_A, () => scan(notifier).execute());

    const everythingSent = JSON.stringify(notifier.sent);
    expect(everythingSent).toContain("CALL TENANT A");
    expect(everythingSent).not.toContain("SECRET OF THE OTHER TENANT");
  });

  it("leaves the other tenant's follow-up unannounced, so its own scan still fires", async () => {
    // Marking it notified would be worse than skipping it: the reminder would
    // be permanently consumed by a scan that never told anyone.
    const notifier = new RecordingNotifier();

    await TenantContext.run(TENANT_A, () => scan(notifier).execute());

    const other = await raw.crmFollowUp.findUniqueOrThrow({ where: { id: "sched-fu-other" } });
    expect(other.dueNotifiedAt).toBeNull();
    const mine = await raw.crmFollowUp.findUniqueOrThrow({ where: { id: "sched-fu-a" } });
    expect(mine.dueNotifiedAt).not.toBeNull();
  });

  it("scans the other tenant only when the scan is run FOR that tenant", async () => {
    // The deferral is "one tenant per run", not "one tenant ever" — sweeping
    // every tenant is an operations decision, and this shows the machinery is
    // ready for it whenever that decision is made.
    const notifier = new RecordingNotifier();

    const summary = await TenantContext.run(OTHER_TENANT, () => scan(notifier).execute());

    expect(summary.announced).toBe(1);
    expect(JSON.stringify(notifier.sent)).toContain("SECRET OF THE OTHER TENANT");
  });

  it("REFUSES to run with no tenant context at all", async () => {
    // The bootstrap's TenantContext.run wrapper is load-bearing. Without it the
    // scoped client fails closed — which is right, but it means the job throws
    // on every fire, and the bootstrap only logs when it announced something.
    // A scheduled job failing silently is precisely K-39.
    const notifier = new RecordingNotifier();

    await expect(scan(notifier).execute()).rejects.toThrow(MissingTenantContextError);
    expect(notifier.sent).toEqual([]);
  });
});
