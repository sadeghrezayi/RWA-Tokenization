import { describe, expect, it } from "vitest";
import { NotifyApprovalPending } from "../../../src/application/notifications/notify-approval-pending.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../../src/application/notifications/ports.js";
import type { StaffUserRepository } from "../../../src/application/identity/ports.js";
import { Approval } from "../../../src/domain/approvals/approval.js";
import { StaffUser } from "../../../src/domain/identity/staff-user.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";

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

const parkedApproval = (makerId: string): Approval =>
  Approval.request(
    "apr-1",
    "ledger.credit",
    { investorId: "inv-9", amountRial: "50000000000" },
    makerId,
    new Date("2026-07-27T10:00:00Z"),
  );

describe("NotifyApprovalPending", () => {
  it("notifies the eligible checkers, excluding the maker", async () => {
    // super_admin + approver hold approval.decide; treasury (the maker) does not
    // decide; compliance_analyst lacks approval.decide.
    const repo = new StubStaff([
      staff("officer-1", ["super_admin"]),
      staff("officer-2", ["treasury"]),
      staff("officer-3", ["approver"]),
      staff("officer-4", ["compliance_analyst"]),
    ]);
    const notifier = new RecordingNotifier();

    await new NotifyApprovalPending(repo, notifier).approvalParked(parkedApproval("officer-2"));

    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.recipients.map((r) => r.id).sort()).toEqual([
      "officer-1",
      "officer-3",
    ]);
    expect(notifier.calls[0]?.recipients.every((r) => r.kind === "staff")).toBe(true);
    expect(notifier.calls[0]?.spec.type).toBe("approval.pending");
    expect(notifier.calls[0]?.spec.body).toContain("50000000000");
    expect(notifier.calls[0]?.spec.body).toContain("inv-9");
  });

  it("excludes a checker who is also the maker (four-eyes on notice, too)", async () => {
    const repo = new StubStaff([
      staff("officer-1", ["super_admin"]),
      staff("officer-3", ["approver"]),
    ]);
    const notifier = new RecordingNotifier();

    // officer-1 is a checker AND the maker -> only officer-3 is notified.
    await new NotifyApprovalPending(repo, notifier).approvalParked(parkedApproval("officer-1"));

    expect(notifier.calls[0]?.recipients.map((r) => r.id)).toEqual(["officer-3"]);
  });

  it("skips disabled checkers", async () => {
    const repo = new StubStaff([
      staff("officer-1", ["super_admin"], "disabled"),
      staff("officer-3", ["approver"]),
    ]);
    const notifier = new RecordingNotifier();

    await new NotifyApprovalPending(repo, notifier).approvalParked(parkedApproval("officer-2"));

    expect(notifier.calls[0]?.recipients.map((r) => r.id)).toEqual(["officer-3"]);
  });

  it("does not emit when there are no eligible checkers", async () => {
    const repo = new StubStaff([staff("officer-4", ["compliance_analyst"])]);
    const notifier = new RecordingNotifier();

    await new NotifyApprovalPending(repo, notifier).approvalParked(parkedApproval("officer-2"));

    expect(notifier.calls).toHaveLength(0);
  });
});
