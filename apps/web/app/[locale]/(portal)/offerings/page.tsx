"use client";

import { OfferingsPanel } from "../../../../components/offerings-panel";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return <OfferingsPanel locale={locale} api={api} token={token} />;
}
