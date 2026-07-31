// Entity (KYB) onboarding is not available yet. Refusing loudly beats silently
// treating a company as an individual — the evidence and checks differ.
export class EntityOnboardingNotAvailableError extends Error {
  constructor() {
    super("entity onboarding is not available yet");
    this.name = "EntityOnboardingNotAvailableError";
  }
}

// Submission attempted while steps are still outstanding. The reviewer's queue
// must never receive a half-filled application.
export class OnboardingIncompleteError extends Error {
  constructor(outstanding: readonly string[]) {
    super(`onboarding is incomplete: ${outstanding.join(", ")}`);
    this.name = "OnboardingIncompleteError";
  }
}

export class InvalidOnboardingTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOnboardingTransitionError";
  }
}
