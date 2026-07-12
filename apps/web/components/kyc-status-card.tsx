"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, InvestorViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button, Card } from "./ui/primitives";
import { kycStatus } from "./ui/status";

export interface KycStatusCardProps {
  locale: Locale;
  api: ApiClient;
  token: string;
}

export const KycStatusCard = ({ locale, api, token }: KycStatusCardProps) => {
  const t = dictionaries[locale];
  const [investor, setInvestor] = useState<InvestorViewDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setInvestor(await api.me(token));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitKyc = async () => {
    try {
      await api.submitKyc(token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const status = investor ? kycStatus(investor.kycState) : undefined;

  return (
    <Card
      title={t.kycStatusTitle}
      actions={status && <Badge tone={status.tone}>{status.label}</Badge>}
    >
      {!investor ? (
        error !== undefined ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )
      ) : (
        <div className="stack">
          <p className={investor.eligibleForClaims ? "" : "muted"}>
            {investor.eligibleForClaims ? t.eligible : t.notEligible}
          </p>
          {investor.kycRejectionReason !== undefined && (
            <p className="field__error">
              {t.rejectionReasonLabel}: {investor.kycRejectionReason}
            </p>
          )}
          <div className="row">
            {investor.kycState === "draft" && (
              <Button
                type="button"
                onClick={() => {
                  void submitKyc();
                }}
              >
                {t.submitKycButton}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void refresh();
              }}
            >
              {t.refreshButton}
            </Button>
          </div>
          {error !== undefined && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
