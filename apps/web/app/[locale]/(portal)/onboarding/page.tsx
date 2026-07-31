"use client";

import { OnboardingWizard } from "../../../../components/investor/onboarding-wizard";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return <OnboardingWizard locale={locale} api={api} csrfToken={token} />;
}
