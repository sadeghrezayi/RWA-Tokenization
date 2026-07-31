import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { InvalidStepAnswersError } from "./errors.js";
import { loadApplication } from "./load-application.js";
import { fieldsFor } from "./onboarding-form.js";
import type { FormField } from "./onboarding-form.js";
import type { EvidenceStore, OnboardingRepository, StepAnswers, StepAnswerStore } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

// Answering a step. Saving and completing are ONE action on purpose: two would
// allow a step marked done whose answers never saved, or answers saved against
// a step the applicant never actually finished.
export class SaveStepAnswers {
  constructor(
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
    private readonly answers: StepAnswerStore,
  ) {}

  async execute(input: {
    investorId: string;
    step: OnboardingStep;
    answers: StepAnswers;
  }): Promise<OnboardingProgressView> {
    const application = await loadApplication(this.applications, input.investorId);
    const fields = fieldsFor(input.step);
    if (fields.length === 0) {
      throw new InvalidStepAnswersError(`the "${input.step}" step is documents, not a form`);
    }

    const accepted = validate(fields, input.answers);

    // Validated first: a refused answer set must leave nothing behind.
    await this.answers.save(input.investorId, input.step, accepted);
    const updated = application.completeStep(input.step);
    await this.applications.save(updated);

    return toProgressView(updated, await this.evidence.listFor(input.investorId));
  }
}

const validate = (fields: readonly FormField[], answers: StepAnswers): StepAnswers => {
  const known = new Set(fields.map((field) => field.name));
  for (const name of Object.keys(answers)) {
    if (!known.has(name)) {
      // Refused rather than dropped: a client stashing extra personal data in
      // the record should hear about it, not have it silently accepted.
      throw new InvalidStepAnswersError(`"${name}" is not part of this step`);
    }
  }

  const accepted: StepAnswers = {};
  for (const field of fields) {
    const raw = answers[field.name];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (value === "") {
      if (field.required) {
        throw new InvalidStepAnswersError(`"${field.label}" is required`);
      }
      continue;
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      throw new InvalidStepAnswersError(`"${field.label}" is too long`);
    }
    if (field.type === "select" && !(field.options ?? []).includes(value)) {
      throw new InvalidStepAnswersError(`"${value}" is not an option for "${field.label}"`);
    }
    if (field.type === "checkbox" && field.required && value !== "true") {
      // An agreement that was not accepted is not an agreement.
      throw new InvalidStepAnswersError(`"${field.label}" must be accepted`);
    }
    accepted[field.name] = value;
  }
  return accepted;
};
