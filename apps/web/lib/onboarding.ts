import type { OnboardingStepDto } from "./api";

// One definition of the wizard's spine, shared by the applicant's wizard and
// the reviewer's file — two copies would drift, and the officer would end up
// reading a step by a different name than the applicant answered it under.
//
// Labels are deliberately neutral ("Personal details", not "Your details") so
// the same string reads correctly on both screens. The FIELDS inside each step
// come from the server (provisional, see the API's onboarding-form.ts).
export const ONBOARDING_STEP_ORDER: OnboardingStepDto[] = [
  "profile",
  "identity_evidence",
  "bank_account",
  "suitability",
  "agreements",
];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStepDto, string> = {
  profile: "Personal details",
  identity_evidence: "Identity document",
  bank_account: "Bank account",
  suitability: "Suitability",
  agreements: "Agreements",
};
