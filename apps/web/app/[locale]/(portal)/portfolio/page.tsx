"use client";

import { HoldingsCard } from "../../../../components/holdings-card";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return <HoldingsCard locale={locale} api={api} token={token} />;
}
