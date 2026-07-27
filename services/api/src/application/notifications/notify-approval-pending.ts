import type { Approval } from "../../domain/approvals/approval.js";
import type { ApprovalParkedNotifier } from "../approvals/ports.js";
import { PERMISSIONS, permissionsForRoles } from "../identity/authorization.js";
import type { StaffUserRepository } from "../identity/ports.js";
import type { Notifier } from "./ports.js";

// 1.7c: on a parked approval, alerts the eligible checkers — active staff whose
// roles grant approval.decide, minus the maker (four-eyes applies to the notice
// as well: the maker is never asked to review their own request).
export class NotifyApprovalPending implements ApprovalParkedNotifier {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly notifier: Notifier,
  ) {}

  async approvalParked(approval: Approval): Promise<void> {
    const staff = await this.staff.findAll();
    const checkers = staff
      .filter(
        (user) =>
          user.isActive() &&
          user.id !== approval.makerId &&
          permissionsForRoles(user.roles).has(PERMISSIONS.APPROVAL_DECIDE),
      )
      .map((user) => ({ kind: "staff" as const, id: user.id, email: user.email.value }));
    if (checkers.length === 0) {
      return;
    }
    await this.notifier.notifyMany(checkers, {
      type: "approval.pending",
      title: "Approval needed",
      body: this.summary(approval),
      // Money is blocked until someone decides — a checker who is not logged in
      // still needs to find out (1.7c-ii).
      important: true,
    });
  }

  private summary(approval: Approval): string {
    const { investorId, amountRial } = approval.payload;
    const detail =
      investorId !== undefined && amountRial !== undefined
        ? `: ${amountRial} Rial to ${investorId}`
        : "";
    return `A ${approval.action} action awaits your approval${detail}.`;
  }
}
