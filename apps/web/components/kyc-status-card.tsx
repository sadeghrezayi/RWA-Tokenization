"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, InvestorViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface KycStatusCardProps {
  locale: Locale;
  api: ApiClient;
  investorId: string;
}

export const KycStatusCard = ({ locale, api, investorId }: KycStatusCardProps) => {
  const t = dictionaries[locale];
  const [investor, setInvestor] = useState<InvestorViewDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setInvestor(await api.getInvestor(investorId));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, investorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!investor) {
    return <section className="card">{error !== undefined && <p role="alert">{error}</p>}</section>;
  }

  const submitKyc = async () => {
    try {
      await api.submitKyc(investorId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card">
      <h2>{t.kycStatusTitle}</h2>
      <p data-testid="kyc-state">{t.kycStates[investor.kycState]}</p>
      <p>{investor.eligibleForClaims ? t.eligible : t.notEligible}</p>
      {investor.kycRejectionReason !== undefined && (
        <p>
          {t.rejectionReasonLabel}: {investor.kycRejectionReason}
        </p>
      )}
      {investor.kycState === "draft" && (
        <button
          type="button"
          onClick={() => {
            void submitKyc();
          }}
        >
          {t.submitKycButton}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void refresh();
        }}
      >
        {t.refreshButton}
      </button>
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
};
