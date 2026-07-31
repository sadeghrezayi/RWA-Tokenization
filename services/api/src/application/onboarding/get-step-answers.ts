import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import type { StepAnswers, StepAnswerStore } from "./ports.js";

export class GetStepAnswers {
  constructor(private readonly answers: StepAnswerStore) {}

  // undefined, not {}: an empty object would render in the wizard as a step
  // answered with blanks.
  execute(input: { investorId: string; step: OnboardingStep }): Promise<StepAnswers | undefined> {
    return this.answers.read(input.investorId, input.step);
  }

  all(input: { investorId: string }): Promise<Partial<Record<OnboardingStep, StepAnswers>>> {
    return this.answers.readAll(input.investorId);
  }
}
