import type {
  DistributionPaidNotice,
  DistributionPaidNotifier,
} from "../../src/application/distributions/ports.js";
import type {
  KycDecisionNotice,
  KycDecisionNotifier,
} from "../../src/application/identity/ports.js";

// 1.7c-ii: recording stand-ins for the event-notification ports, so use-case
// tests can assert an event was announced without pulling in the notification
// persistence stack.
export class RecordingKycDecisionNotifier implements KycDecisionNotifier {
  readonly notices: KycDecisionNotice[] = [];
  kycDecided(notice: KycDecisionNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }
}

export class RecordingDistributionPaidNotifier implements DistributionPaidNotifier {
  readonly notices: DistributionPaidNotice[] = [];
  distributionPaid(notice: DistributionPaidNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }
}
