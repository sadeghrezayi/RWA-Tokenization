import type {
  ChangeRequest,
  OnboardingApplication,
  OnboardingStatus,
  OnboardingStep,
} from "../../domain/onboarding/onboarding-application.js";
import type { EvidenceDescriptor } from "./ports.js";

// What every onboarding use case hands back: enough for a wizard to render the
// whole screen without a second round-trip, and never any document content.
export interface OnboardingProgressView {
  applicationId: string;
  status: OnboardingStatus;
  completedSteps: OnboardingStep[];
  outstandingSteps: OnboardingStep[];
  changeRequests: ChangeRequest[];
  evidence: EvidenceDescriptor[];
  submittedAt?: Date;
}

export const toProgressView = (
  application: OnboardingApplication,
  evidence: EvidenceDescriptor[],
): OnboardingProgressView => ({
  applicationId: application.id,
  status: application.status,
  completedSteps: application.completedSteps(),
  outstandingSteps: application.outstandingSteps(),
  changeRequests: [...application.changeRequests],
  evidence,
  // exactOptionalPropertyTypes: omit rather than set undefined.
  ...(application.submittedAt !== undefined ? { submittedAt: application.submittedAt } : {}),
});
