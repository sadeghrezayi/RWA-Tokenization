"use client";

import { use } from "react";
import { PositionCard } from "../../../../../components/investor/position-card";
import { useInvestorSession } from "../../../../../components/investor/investor-session";

// 2.5c: one holding, in full. Reached from the portfolio's holdings table.
export default function PositionRoute({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = use(params);
  const { locale, api } = useInvestorSession();
  return <PositionCard locale={locale} api={api} assetId={assetId} />;
}
