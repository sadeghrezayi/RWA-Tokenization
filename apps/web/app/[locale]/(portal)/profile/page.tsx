"use client";

import { KycStatusCard } from "../../../../components/kyc-status-card";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return <KycStatusCard locale={locale} api={api} token={token} />;
}
