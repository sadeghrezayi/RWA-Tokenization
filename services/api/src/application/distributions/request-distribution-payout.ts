import { Approval } from "../../domain/approvals/approval.js";
import type { ApprovalParkedNotifier, ApprovalRepository } from "../approvals/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import { loadDistribution } from "./get-distribution.js";
import type { DistributionRepository } from "./ports.js";

export interface PayoutRequestResult {
  status: "pending_approval";
  approvalId: string;
}

// Phase 4.1 / threat model T3. A payout credits every holder of an asset in one
// go, and one officer could do it alone — the same exposure four-eyes already
// closes for a large ledger credit.
//
// NO THRESHOLD, deliberately, unlike ledger.credit: the amount that makes a
// payout worth a second look is a policy question nobody has answered, and
// "every payout" is the safe reading of the threat model's "four-eyes on the
// sensitive-action set". If the owner wants a threshold, it belongs here and
// should be configured the way LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL is.
export class RequestDistributionPayout {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly approvals: ApprovalRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly parkedNotifier: ApprovalParkedNotifier,
  ) {}

  async execute(input: { distributionId: string; makerId: string }): Promise<PayoutRequestResult> {
    // Load first: parking an approval for a distribution that does not exist
    // would put an un-executable item in the checkers' queue.
    const distribution = await loadDistribution(this.distributions, input.distributionId);

    const approval = Approval.request(
      this.ids.nextId(),
      "distribution.pay",
      { distributionId: distribution.id },
      input.makerId,
      this.clock.now(),
    );
    await this.approvals.save(approval);
    await this.parkedNotifier.approvalParked(approval);
    return { status: "pending_approval", approvalId: approval.id };
  }
}
