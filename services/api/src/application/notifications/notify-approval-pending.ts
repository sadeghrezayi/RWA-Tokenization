import type { Approval } from "../../domain/approvals/approval.js";
import type { ApprovalParkedNotifier } from "../approvals/ports.js";
import { PERMISSIONS, permissionsForRoles } from "../identity/authorization.js";
import type { InvestorRepository, StaffUserRepository } from "../identity/ports.js";
import type { Notifier } from "./ports.js";

// 1.7c: on a parked approval, alerts the eligible checkers — active staff whose
// roles grant approval.decide, minus the maker (four-eyes applies to the notice
// as well: the maker is never asked to review their own request).
export class NotifyApprovalPending implements ApprovalParkedNotifier {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly investors: InvestorRepository,
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
      body: await this.summary(approval),
      // Money is blocked until someone decides — a checker who is not logged in
      // still needs to find out (1.7c-ii).
      important: true,
    });
  }

  // Human labels, not raw identifiers (P2): name the investor by email and group
  // the amount's digits, so a checker can judge the request at a glance. If the
  // investor cannot be resolved the alert still goes out — money is waiting —
  // just with the id as the fallback label.
  private async summary(approval: Approval): Promise<string> {
    const { investorId, amountRial } = approval.payload;
    if (investorId === undefined || amountRial === undefined) {
      return `A ${approval.action} action awaits your approval.`;
    }
    const investor = await this.investors.findById(investorId);
    const who = investor?.email.value ?? investorId;
    return `A ${approval.action} action awaits your approval: ${groupDigits(amountRial)} Rial to ${who}.`;
  }
}

// 50000000000 -> "50,000,000,000". Kept local and string-based: the amount is a
// minor-unit integer that must not round-trip through a float.
const groupDigits = (amount: string): string => amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
