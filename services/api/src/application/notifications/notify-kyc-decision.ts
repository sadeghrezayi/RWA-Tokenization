import type { KycDecisionNotifier, KycDecisionNotice } from "../identity/ports.js";
import type { Notifier } from "./ports.js";

// 1.7c-ii: tells an investor how their KYC review was decided. Marked important
// — it is account-critical and the investor is typically NOT logged in while
// waiting, so it is emailed as well as shown in-app.
export class NotifyKycDecision implements KycDecisionNotifier {
  constructor(private readonly notifier: Notifier) {}

  async kycDecided(notice: KycDecisionNotice): Promise<void> {
    const approved = notice.decision === "approved";
    const body = approved
      ? "Your identity verification is complete. You can now invest."
      : `Your identity verification was not accepted: ${notice.reason ?? "no reason given"}.`;
    await this.notifier.notify(
      { kind: "investor", id: notice.investorId, email: notice.email },
      {
        type: "kyc.decided",
        title: approved ? "Your KYC was approved" : "Your KYC was rejected",
        body,
        important: true,
      },
    );
  }
}
