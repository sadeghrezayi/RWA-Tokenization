import { describe, expect, it } from "vitest";
import { NotifyKycDecision } from "../../../src/application/notifications/notify-kyc-decision.js";
import { NotifyDistributionPaid } from "../../../src/application/notifications/notify-distribution-paid.js";
import type {
  NotificationRecipient,
  NotificationSpec,
  Notifier,
} from "../../../src/application/notifications/ports.js";

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

describe("NotifyKycDecision", () => {
  it("tells the investor their KYC was approved, and emails it (important)", async () => {
    const notifier = new RecordingNotifier();
    await new NotifyKycDecision(notifier).kycDecided({
      investorId: "inv-1",
      email: "sara@demo.com",
      decision: "approved",
    });

    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]?.recipients).toEqual([
      { kind: "investor", id: "inv-1", email: "sara@demo.com" },
    ]);
    const spec = notifier.calls[0]?.spec;
    expect(spec?.type).toBe("kyc.decided");
    expect(spec?.important).toBe(true);
    expect(spec?.title).toContain("approved");
  });

  it("tells the investor their KYC was rejected, including the reason", async () => {
    const notifier = new RecordingNotifier();
    await new NotifyKycDecision(notifier).kycDecided({
      investorId: "inv-2",
      email: "ali@demo.com",
      decision: "rejected",
      reason: "document expired",
    });

    const spec = notifier.calls[0]?.spec;
    expect(spec?.title).toContain("rejected");
    expect(spec?.body).toContain("document expired");
    expect(spec?.important).toBe(true);
  });
});

describe("NotifyDistributionPaid", () => {
  it("tells each paid investor their share (in-app only)", async () => {
    const notifier = new RecordingNotifier();
    await new NotifyDistributionPaid(notifier).distributionPaid({
      distributionId: "dist-1",
      assetName: "Vanak Tower",
      payouts: [
        { investorId: "inv-1", amountRial: 1000n },
        { investorId: "inv-2", amountRial: 2500n },
      ],
    });

    // A distinct message per investor: the amount differs, so no shared fan-out.
    expect(notifier.calls).toHaveLength(2);
    expect(notifier.calls[0]?.recipients).toEqual([{ kind: "investor", id: "inv-1" }]);
    expect(notifier.calls[0]?.spec.type).toBe("distribution.paid");
    expect(notifier.calls[0]?.spec.body).toContain("1000");
    expect(notifier.calls[0]?.spec.body).toContain("Vanak Tower");
    expect(notifier.calls[1]?.spec.body).toContain("2500");
    // Informational, not actionable → in-app only, no email.
    expect(notifier.calls.every((c) => c.spec.important !== true)).toBe(true);
  });

  it("does nothing when a distribution paid no one", async () => {
    const notifier = new RecordingNotifier();
    await new NotifyDistributionPaid(notifier).distributionPaid({
      distributionId: "dist-2",
      assetName: "Empty",
      payouts: [],
    });
    expect(notifier.calls).toHaveLength(0);
  });
});
