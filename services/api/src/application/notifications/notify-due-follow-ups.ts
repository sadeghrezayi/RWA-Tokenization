import type { FollowUpRepository } from "../crm/ports.js";
import { PERMISSIONS, permissionsForRoles } from "../identity/authorization.js";
import type { StaffUserRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import type { Notifier } from "./ports.js";

export interface DueFollowUpSummary {
  scanned: number;
  announced: number;
}

// 1.7d: the scheduled reminder scan. Unlike every other notification trigger,
// this one has no request to hang off — a follow-up simply becomes due as time
// passes — which is what the job scheduler exists for.
//
// A follow-up has no owner field today, so the reminder goes to the staff who
// can actually act on it: active users whose roles grant crm.manage. Per-
// follow-up ownership is a product decision, not one to invent here.
export class NotifyDueFollowUps {
  constructor(
    private readonly followUps: FollowUpRepository,
    private readonly staff: StaffUserRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DueFollowUpSummary> {
    const now = this.clock.now();
    const due = (await this.followUps.listOpen()).filter((f) => f.needsDueNotice(now));
    if (due.length === 0) {
      return { scanned: 0, announced: 0 };
    }

    const recipients = (await this.staff.findAll())
      .filter(
        (user) => user.isActive() && permissionsForRoles(user.roles).has(PERMISSIONS.CRM_MANAGE),
      )
      .map((user) => ({ kind: "staff" as const, id: user.id, email: user.email.value }));
    if (recipients.length === 0) {
      // Nobody can act on it yet. Deliberately NOT marked as announced, so the
      // reminder still fires once CRM staff exist — silence must not be final.
      return { scanned: due.length, announced: 0 };
    }

    let announced = 0;
    for (const followUp of due) {
      await this.notifier.notifyMany(recipients, {
        type: "crm.follow_up_due",
        title: "Follow-up overdue",
        body: `A follow-up is past its due date: ${followUp.text}.`,
      });
      await this.followUps.save(followUp.markDueNotified(now));
      announced += 1;
    }
    return { scanned: due.length, announced };
  }
}
