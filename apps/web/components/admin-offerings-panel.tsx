"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, OfferingViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface AdminOfferingsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
}

// FR-PT-3 subset: operator credits the Rial ledger (simulated bank deposit),
// configures offerings against a tokenized asset, opens and closes them.
export const AdminOfferingsPanel = ({ locale, api, token }: AdminOfferingsPanelProps) => {
  const t = dictionaries[locale];
  const [offerings, setOfferings] = useState<OfferingViewDto[]>([]);
  const [assetId, setAssetId] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setOfferings(await api.listOfferings(token));
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

  const creditLedger = () => {
    const investorId = window.prompt(t.creditInvestorPrompt);
    if (investorId === null || investorId.trim() === "") return;
    const amount = window.prompt(t.creditAmountPrompt);
    if (amount === null || amount.trim() === "") return;
    guard(() => api.creditLedger(token, investorId.trim(), amount.trim()));
  };

  return (
    <section className="card">
      <h2>{t.offeringsTitle}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Default pilot terms; per-field config is a later refinement.
          guard(async () => {
            await api.createOffering(token, {
              assetId,
              supply: "100",
              priceRial: "1000",
              minPerInvestor: "5",
              maxPerInvestor: "80",
              minimumRaise: "20",
              opensAt: "2026-07-01T00:00:00.000Z",
              closesAt: "2027-01-01T00:00:00.000Z",
            });
            setAssetId("");
          });
        }}
      >
        <label htmlFor="offering-asset-id">{t.offeringConfigPrompt}</label>
        <input
          id="offering-asset-id"
          required
          value={assetId}
          onChange={(e) => {
            setAssetId(e.target.value);
          }}
        />
        <button type="submit">{t.createOfferingButton}</button>
      </form>
      <button
        type="button"
        onClick={() => {
          creditLedger();
        }}
      >
        {t.creditLedgerButton}
      </button>

      {offerings.length === 0 ? (
        <p>{t.noOfferings}</p>
      ) : (
        <ul>
          {offerings.map((offering) => (
            <li key={offering.id} data-testid={`admin-offering-${offering.id}`}>
              <strong>{offering.assetId}</strong> — <span>{offering.state}</span> ·{" "}
              {t.subscribedLabel}: {offering.totalSubscribed}/{offering.supply}
              {offering.state === "draft" && (
                <button
                  type="button"
                  onClick={() => {
                    guard(() => api.openOffering(token, offering.id));
                  }}
                >
                  {t.openOfferingButton}
                </button>
              )}
              {offering.state === "open" && (
                <button
                  type="button"
                  onClick={() => {
                    guard(async () => {
                      await api.closeOffering(token, offering.id);
                    });
                  }}
                >
                  {t.closeOfferingButton}
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
