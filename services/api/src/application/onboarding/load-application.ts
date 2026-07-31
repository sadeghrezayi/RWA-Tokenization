import type { OnboardingApplication } from "../../domain/onboarding/onboarding-application.js";
import { OnboardingNotStartedError } from "./errors.js";
import type { OnboardingRepository } from "./ports.js";

export const loadApplication = async (
  applications: OnboardingRepository,
  investorId: string,
): Promise<OnboardingApplication> => {
  const application = await applications.findByInvestor(investorId);
  if (!application) {
    throw new OnboardingNotStartedError(investorId);
  }
  return application;
};
