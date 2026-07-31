import type { ChangeRequest } from "../../domain/onboarding/onboarding-application.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { InvestorRepository } from "../identity/ports.js";
import type { Notifier } from "../notifications/ports.js";
import { loadApplication } from "./load-application.js";
import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

// The reviewer sending an application back. Deliberately NOT a KYC decision:
// the investor's KYC state is left exactly as the officer left it (submitted or
// in_review), because the case is still open — only the wizard reopens.
export class RequestOnboardingChanges {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
    private readonly notifier: Notifier,
  ) {}

  async execute(input: {
    investorId: string;
    requests: readonly ChangeRequest[];
  }): Promise<OnboardingProgressView> {
    const application = await loadApplication(this.applications, input.investorId);
    const returned = application.requestChanges(input.requests);
    await this.applications.save(returned);

    // Important: the applicant is typically not logged in, and an application
    // nobody knows came back is an application that stalls forever.
    const investor = await loadInvestor(this.investors, input.investorId);
    await this.notifier.notify(
      { kind: "investor", id: investor.id, email: investor.email.value },
      {
        type: "onboarding.changes_requested",
        title: "Your application needs changes",
        body: `Please update the following and resubmit: ${returned.changeRequests
          .map((request) => `${request.step} — ${request.reason}`)
          .join("; ")}.`,
        important: true,
      },
    );

    return toProgressView(returned, await this.evidence.listFor(input.investorId));
  }
}
