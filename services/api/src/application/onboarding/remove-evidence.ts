import { InvalidOnboardingTransitionError } from "../../domain/onboarding/errors.js";
import { EvidenceNotFoundError } from "./errors.js";
import { hasIdentityEvidence } from "./complete-onboarding-step.js";
import { loadApplication } from "./load-application.js";
import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

export class RemoveEvidence {
  constructor(
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
  ) {}

  async execute(input: { investorId: string; reference: string }): Promise<OnboardingProgressView> {
    const application = await loadApplication(this.applications, input.investorId);
    if (application.status === "submitted") {
      throw new InvalidOnboardingTransitionError(
        "an application under review cannot be edited; ask the reviewer for changes first",
      );
    }

    const owned = await this.evidence.listFor(input.investorId);
    if (!owned.some((descriptor) => descriptor.reference === input.reference)) {
      // Same answer whether it belongs to someone else or does not exist, so
      // nobody can probe for other applicants' documents.
      throw new EvidenceNotFoundError(input.reference);
    }

    await this.evidence.erase(input.reference);

    const remaining = await this.evidence.listFor(input.investorId);
    // A completed evidence step must never point at nothing.
    const updated = hasIdentityEvidence(remaining)
      ? application
      : application.reopenStep("identity_evidence");
    await this.applications.save(updated);
    return toProgressView(updated, remaining);
  }
}
