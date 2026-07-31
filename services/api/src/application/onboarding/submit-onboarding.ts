import { loadInvestor } from "../identity/load-investor.js";
import type { InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import { KycDecisionIsFinalError } from "./errors.js";
import { loadApplication } from "./load-application.js";
import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

export class SubmitOnboarding {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly applications: OnboardingRepository,
    private readonly clock: Clock,
    private readonly evidence: EvidenceStore,
  ) {}

  async execute(input: { investorId: string }): Promise<OnboardingProgressView> {
    const application = await loadApplication(this.applications, input.investorId);
    // Checked before anything is written, so a refused submission leaves the
    // application exactly as the applicant left it.
    const investor = await loadInvestor(this.investors, input.investorId);
    if (investor.kycStatus.state === "rejected" || investor.kycStatus.state === "expired") {
      throw new KycDecisionIsFinalError();
    }

    const submitted = application.submit(this.clock.now());
    await this.applications.save(submitted);

    // The KYC state machine stays the authority on review; the wizard is what
    // feeds it. Only a first submission moves the investor into the queue — a
    // resubmission after requested changes leaves an in-progress review alone,
    // since in_review → submitted is not a legal transition.
    if (investor.kycStatus.state === "draft") {
      await this.investors.save(investor.submitKyc());
    }

    return toProgressView(submitted, await this.evidence.listFor(input.investorId));
  }
}
