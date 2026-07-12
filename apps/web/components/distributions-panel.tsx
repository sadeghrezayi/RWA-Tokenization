"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, DistributionViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface DistributionsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
}

// FR-YD (FR-PT-3 subset): operator declares an income distribution for a
// tokenized asset, reviews the pro-rata reconciliation, then pays it out.
export const DistributionsPanel = ({ locale, api, token }: DistributionsPanelProps) => {
  const t = dictionaries[locale];
  const [distributions, setDistributions] = useState<DistributionViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setDistributions(await api.listDistributions(token));
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  const guard = (action: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  const declare = () => {
    const assetId = window.prompt(t.offeringConfigPrompt);
    if (assetId === null || assetId.trim() === "") return;
    const amount = window.prompt(t.distributionAmountPrompt);
    if (amount === null || amount.trim() === "") return;
    guard(async () => {
      await api.declareDistribution(token, assetId.trim(), amount.trim());
    });
  };

  return (
    <section className="card">
      <h2>{t.distributionsTitle}</h2>
      <button
        type="button"
        onClick={() => {
          declare();
        }}
      >
        {t.declareDistributionButton}
      </button>

      {distributions.length === 0 ? (
        <p>{t.noDistributions}</p>
      ) : (
        <ul>
          {distributions.map((distribution) => (
            <li key={distribution.id} data-testid={`distribution-${distribution.id}`}>
              <strong>{distribution.assetId}</strong> — <span>{distribution.state}</span> ·{" "}
              {distribution.totalAmountRial} Rial
              <p>
                {t.reconciliationLabel}: {distribution.reconciliation.allocated}/
                {distribution.reconciliation.declared}
                {distribution.reconciliation.balanced ? ` (${t.balancedLabel})` : ""}
              </p>
              <p>
                {t.payoutsLabel}:{" "}
                {distribution.payouts.map((p) => `${p.investorId}=${p.amountRial}`).join(", ")}
              </p>
              {distribution.state === "declared" && (
                <button
                  type="button"
                  onClick={() => {
                    guard(() => api.payDistribution(token, distribution.id));
                  }}
                >
                  {t.payDistributionButton}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
};
