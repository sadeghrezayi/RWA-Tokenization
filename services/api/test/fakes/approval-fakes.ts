import type { Approval, ApprovalStatus } from "../../src/domain/approvals/approval.js";
import type {
  ApprovalParkedNotifier,
  ApprovalRepository,
} from "../../src/application/approvals/ports.js";

// Shared because two suites now park approvals: the approvals use-cases and the
// distribution payout that joined the sensitive set in 4.1.
export class InMemoryApprovalRepository implements ApprovalRepository {
  readonly byId = new Map<string, Approval>();

  save(approval: Approval): Promise<void> {
    this.byId.set(approval.id, approval);
    return Promise.resolve();
  }

  findById(id: string): Promise<Approval | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByStatus(status: ApprovalStatus): Promise<Approval[]> {
    return Promise.resolve([...this.byId.values()].filter((a) => a.status === status));
  }
}

// A parked approval nobody is told about is a queue nobody watches (1.7c).
export class RecordingApprovalParkedNotifier implements ApprovalParkedNotifier {
  readonly parked: Approval[] = [];

  approvalParked(approval: Approval): Promise<void> {
    this.parked.push(approval);
    return Promise.resolve();
  }
}
