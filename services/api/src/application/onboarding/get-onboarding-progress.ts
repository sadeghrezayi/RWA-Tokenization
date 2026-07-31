import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

export class GetOnboardingProgress {
  constructor(
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
  ) {}

  // undefined, not an empty application: the caller must be able to tell
  // "never started" from "started and nothing filled in yet".
  async execute(input: { investorId: string }): Promise<OnboardingProgressView | undefined> {
    const application = await this.applications.findByInvestor(input.investorId);
    if (!application) {
      return undefined;
    }
    return toProgressView(application, await this.evidence.listFor(input.investorId));
  }
}
