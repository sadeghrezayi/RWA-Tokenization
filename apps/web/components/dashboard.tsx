"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { KycStatusCard } from "./kyc-status-card";
import { RegisterForm } from "./register-form";

const STORAGE_KEY = "tokenization.investorId";

// FR-PT-1 subset: registration + KYC status. Investor identity is a stored id
// until real authentication (FR-ID-1 password login) lands in a later step.
export const Dashboard = ({ locale }: { locale: Locale }) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const [investorId, setInvestorId] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInvestorId(localStorage.getItem(STORAGE_KEY) ?? undefined);
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <>
      <h2>{t.dashboardTitle}</h2>
      {investorId === undefined ? (
        <RegisterForm
          locale={locale}
          api={api}
          onRegistered={(id) => {
            localStorage.setItem(STORAGE_KEY, id);
            setInvestorId(id);
          }}
        />
      ) : (
        <KycStatusCard locale={locale} api={api} investorId={investorId} />
      )}
    </>
  );
};
