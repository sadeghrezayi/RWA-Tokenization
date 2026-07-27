import { describe, expect, it } from "vitest";
import { NotifyDueFollowUps } from "../../../src/application/notifications/notify-due-follow-ups.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../../src/application/notifications/ports.js";
import type { FollowUpRepository } from "../../../src/application/crm/ports.js";
import type { StaffUserRepository } from "../../../src/application/identity/ports.js";
import { FollowUp } from "../../../src/domain/crm/follow-up.js";
import { StaffUser } from "../../../src/domain/identity/staff-user.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const NOW = new Date("2026-07-27T10:00:00Z");
const YESTERDAY = new Date("2026-07-26T10:00:00Z");
const TOMORROW = new Date("2026-07-28T10:00:00Z");

const staff = (id: string, roles: string[], status: "active" | "disabled" = "active"): StaffUser =>
  StaffUser.restore(
    id,
    EmailAddress.of(`${id}@platform.local`),
    PasswordHash.of("hashed:x"),
    status,
    roles,
  );

class StubStaff implements StaffUserRepository {
  constructor(private readonly users: StaffUser[]) {}
  findAll(): Promise<StaffUser[]> {
    return Promise.resolve(this.users);
  }
  findByEmail(): Promise<StaffUser | undefined> {
    return Promise.resolve(undefined);
  }
  findById(): Promise<StaffUser | undefined> {
    return Promise.resolve(undefined);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

class InMemoryFollowUps implements FollowUpRepository {
  constructor(public rows: FollowUp[] = []) {}
  findById(id: string): Promise<FollowUp | undefined> {
    return Promise.resolve(this.rows.find((f) => f.id === id));
  }
  listByInvestor(investorId: string): Promise<FollowUp[]> {
    return Promise.resolve(this.rows.filter((f) => f.investorId === investorId));
  }
  listOpen(): Promise<FollowUp[]> {
    return Promise.resolve(this.rows.filter((f) => f.state === "open"));
  }
  save(followUp: FollowUp): Promise<void> {
    const i = this.rows.findIndex((f) => f.id === followUp.id);
    if (i >= 0) this.rows[i] = followUp;
    else this.rows.push(followUp);
    return Promise.resolve();
  }
}

class RecordingNotifier implements Notifier {
  readonly calls: { recipients: NotificationRecipient[]; spec: NotificationSpec }[] = [];
  notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [recipient], spec });
    return Promise.resolve();
  }
  notifyMany(recipients: readonly NotificationRecipient[], spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [...recipients], spec });
    return Promise.resolve();
  }
}

const followUp = (id: string, dueAt: Date): FollowUp =>
  FollowUp.create({
    id,
    investorId: "inv-1",
    text: `chase ${id}`,
    dueAt,
    createdAt: new Date("2026-07-20T10:00:00Z"),
  });

const setup = (rows: FollowUp[], users = [staff("officer-5", ["compliance_analyst"])]) => {
  const followUps = new InMemoryFollowUps(rows);
  const notifier = new RecordingNotifier();
  return {
    followUps,
    notifier,
    run: new NotifyDueFollowUps(followUps, new StubStaff(users), notifier, new FixedClock(NOW)),
  };
};

describe("NotifyDueFollowUps", () => {
  it("announces an overdue follow-up to the CRM staff and records that it did", async () => {
    const s = setup([followUp("f-late", YESTERDAY)]);

    const summary = await s.run.execute();

    expect(summary).toEqual({ scanned: 1, announced: 1 });
    expect(s.notifier.calls).toHaveLength(1);
    expect(s.notifier.calls[0]?.recipients.map((r) => r.id)).toEqual(["officer-5"]);
    expect(s.notifier.calls[0]?.spec.type).toBe("crm.follow_up_due");
    expect(s.notifier.calls[0]?.spec.body).toContain("chase f-late");
    // Persisted, so the next scan does not repeat it.
    expect(s.followUps.rows[0]?.dueNotifiedAt).toEqual(NOW);
  });

  it("never announces the same follow-up twice across scans", async () => {
    const s = setup([followUp("f-late", YESTERDAY)]);

    await s.run.execute();
    const second = await s.run.execute();

    expect(second).toEqual({ scanned: 0, announced: 0 });
    expect(s.notifier.calls).toHaveLength(1); // still just the one
  });

  it("ignores follow-ups that are not due yet", async () => {
    const s = setup([followUp("f-future", TOMORROW)]);
    expect(await s.run.execute()).toEqual({ scanned: 0, announced: 0 });
    expect(s.notifier.calls).toHaveLength(0);
  });

  it("ignores completed follow-ups even if their due date passed", async () => {
    const s = setup([followUp("f-done", YESTERDAY).complete(NOW)]);
    expect(await s.run.execute()).toEqual({ scanned: 0, announced: 0 });
    expect(s.notifier.calls).toHaveLength(0);
  });

  it("announces each overdue follow-up separately", async () => {
    const s = setup([followUp("f-a", YESTERDAY), followUp("f-b", YESTERDAY)]);
    const summary = await s.run.execute();
    expect(summary).toEqual({ scanned: 2, announced: 2 });
    expect(s.notifier.calls).toHaveLength(2);
  });

  it("skips staff who cannot work the CRM, and disabled accounts", async () => {
    const s = setup(
      [followUp("f-late", YESTERDAY)],
      [
        staff("officer-5", ["compliance_analyst"]), // holds crm.manage
        staff("officer-6", ["auditor"]), // read-only, not a CRM worker
        staff("officer-7", ["compliance_analyst"], "disabled"),
      ],
    );

    await s.run.execute();

    expect(s.notifier.calls[0]?.recipients.map((r) => r.id)).toEqual(["officer-5"]);
  });

  it("does not mark anything notified when there is nobody to tell", async () => {
    const s = setup([followUp("f-late", YESTERDAY)], [staff("officer-6", ["auditor"])]);

    const summary = await s.run.execute();

    expect(summary).toEqual({ scanned: 1, announced: 0 });
    expect(s.notifier.calls).toHaveLength(0);
    // Left un-announced on purpose: once staff exist, the reminder still fires.
    expect(s.followUps.rows[0]?.dueNotifiedAt).toBeUndefined();
  });
});
