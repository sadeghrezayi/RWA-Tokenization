"use client";

import { FundingCard } from "../../../../components/investor/funding-card";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return <FundingCard locale={locale} api={api} csrfToken={token} token={token} />;
}
