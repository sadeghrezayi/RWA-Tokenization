"use client";

import { HoldingsCard } from "../../../../components/holdings-card";
import { PortfolioSummary } from "../../../../components/investor/portfolio-summary";
import { useInvestorSession } from "../../../../components/investor/investor-session";

export default function Page() {
  const { locale, api, token } = useInvestorSession();
  return (
    <div className="stack">
      {/* Position first — what it is worth and what it has paid — then the
          holdings themselves, where transfer and redemption live. */}
      <PortfolioSummary locale={locale} api={api} />
      <HoldingsCard locale={locale} api={api} token={token} />
    </div>
  );
}
