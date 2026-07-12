"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { AuthPanel } from "./auth-panel";
import { KycStatusCard } from "./kyc-status-card";
import { OfferingsPanel } from "./offerings-panel";
import { Button } from "./ui/primitives";

const TOKEN_KEY = "tokenization.token";

// FR-PT-1 subset: authenticated registration/login + KYC status (FR-ID-1).
export const Dashboard = ({ locale }: { locale: Locale }) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? undefined);
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <div className="stack">
      <div className="row row--between">
        <div>
          <h1 className="page-title">{t.dashboardTitle}</h1>
          <p className="page-subtitle">{t.dashboardSubtitle}</p>
        </div>
        {token !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.removeItem(TOKEN_KEY);
              setToken(undefined);
            }}
          >
            {t.logout}
          </Button>
        )}
      </div>

      {token === undefined ? (
        <AuthPanel
          locale={locale}
          api={api}
          onAuthed={(newToken) => {
            sessionStorage.setItem(TOKEN_KEY, newToken);
            setToken(newToken);
          }}
        />
      ) : (
        <>
          <KycStatusCard locale={locale} api={api} token={token} />
          <OfferingsPanel locale={locale} api={api} token={token} />
        </>
      )}
    </div>
  );
};
