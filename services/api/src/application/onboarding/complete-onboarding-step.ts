import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { MissingIdentityEvidenceError } from "./errors.js";
import { loadApplication } from "./load-application.js";
import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

export class CompleteOnboardingStep {
  constructor(
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
  ) {}

  async execute(input: {
    investorId: string;
    step: OnboardingStep;
  }): Promise<OnboardingProgressView> {
    const application = await loadApplication(this.applications, input.investorId);
    const stored = await this.evidence.listFor(input.investorId);

    // The evidence step's whole purpose is the document behind it. Letting it
    // pass empty would put an unreviewable application in front of an officer.
    if (input.step === "identity_evidence" && !hasIdentityEvidence(stored)) {
      throw new MissingIdentityEvidenceError();
    }

    const updated = application.completeStep(input.step);
    await this.applications.save(updated);
    return toProgressView(updated, stored);
  }
}

export const hasIdentityEvidence = (stored: readonly { step: OnboardingStep }[]): boolean =>
  stored.some((descriptor) => descriptor.step === "identity_evidence");
