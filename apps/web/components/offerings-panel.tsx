"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, LedgerDto, OfferingViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface OfferingsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
}

// FR-PT-1 subset: an investor sees their settlement balance, the open
// offerings, and their own subscription/allocation — never other holders'.
export const OfferingsPanel = ({ locale, api, token }: OfferingsPanelProps) => {
  const t = dictionaries[locale];
  const [ledger, setLedger] = useState<LedgerDto | undefined>(undefined);
  const [offerings, setOfferings] = useState<OfferingViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [balance, list] = await Promise.all([api.ledgerMe(token), api.listOfferings(token)]);
    setLedger(balance);
    setOfferings(list);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  const subscribe = (offeringId: string) => {
    const raw = window.prompt(t.subscribeTokensPrompt) ?? "";
    if (raw.trim() === "") {
      return;
    }
    setError(undefined);
    void (async () => {
      try {
        await api.subscribeOffering(token, offeringId, raw.trim());
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <section className="card">
      <h2>{t.balanceTitle}</h2>
      {ledger && (
        <p>
          {t.availableLabel}: {ledger.balanceRial} — {t.heldLabel}: {ledger.heldRial}
        </p>
      )}

      <h2>{t.offeringsTitle}</h2>
      {offerings.length === 0 ? (
        <p>{t.noOfferings}</p>
      ) : (
        <ul>
          {offerings.map((offering) => (
            <li key={offering.id} data-testid={`offering-${offering.id}`}>
              <strong>{offering.assetId}</strong> — <span>{offering.state}</span>
              <p>
                {t.supplyLabel}: {offering.supply} · {t.priceLabel}: {offering.priceRial} ·{" "}
                {t.subscribedLabel}: {offering.totalSubscribed}
              </p>
              {offering.mySubscribed !== undefined && (
                <p>
                  {t.mySubscriptionLabel}: {offering.mySubscribed}
                </p>
              )}
              {offering.myAllocation && (
                <p>
                  {t.myAllocationLabel}: {offering.myAllocation.allocated} (refund{" "}
                  {offering.myAllocation.refundRial})
                </p>
              )}
              {offering.state === "open" && (
                <button
                  type="button"
                  onClick={() => {
                    subscribe(offering.id);
                  }}
                >
                  {t.subscribeButton}
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
