import type {
  DistributionPaidNotice,
  DistributionPaidNotifier,
} from "../../src/application/distributions/ports.js";
import type {
  KycDecisionNotice,
  KycDecisionNotifier,
} from "../../src/application/identity/ports.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../src/application/notifications/ports.js";

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

// The Notifier itself, for use-cases that raise notifications directly. `calls`
// keeps the fan-out shape (one entry per notify/notifyMany); `sent` flattens it
// to one entry per recipient, which is what most assertions want.
export class RecordingNotifier implements Notifier {
  readonly calls: { recipients: NotificationRecipient[]; spec: NotificationSpec }[] = [];

  get sent(): { recipient: NotificationRecipient; spec: NotificationSpec }[] {
    return this.calls.flatMap((call) =>
      call.recipients.map((recipient) => ({ recipient, spec: call.spec })),
    );
  }

  notify(recipient: NotificationRecipient, spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [recipient], spec });
    return Promise.resolve();
  }

  notifyMany(recipients: readonly NotificationRecipient[], spec: NotificationSpec): Promise<void> {
    this.calls.push({ recipients: [...recipients], spec });
    return Promise.resolve();
  }
}
