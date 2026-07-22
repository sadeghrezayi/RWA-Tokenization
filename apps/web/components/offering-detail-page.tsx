"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, OfferingViewDto } from "../lib/api";
import { formatDate, formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address, Progress } from "./ui/address";
import { Badge } from "./ui/badge";
import { Button, Card, Stat } from "./ui/primitives";
import { offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

// FR-PI / FR-PT-3: the offering's own page — configuration, subscription
// window, raise progress, and the open/close lifecycle actions inline.
export const OfferingDetailPage = ({
  locale,
  api,
  token,
  offeringId,
  onBack,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  offeringId: string;
  onBack: () => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [offering, setOffering] = useState<OfferingViewDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setOffering(await api.getOffering(token, offeringId));
  }, [api, token, offeringId]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const act = (action: () => Promise<unknown>, msg: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        toast.show(msg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  if (offering === undefined) {
    return (
      <div className="stack">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.backToOfferings}
        </Button>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const status = offeringStatus(offering.state);

  return (
    <div className="stack">
      <Button variant="ghost" size="sm" onClick={onBack}>
        {t.backToOfferings}
      </Button>

      <div className="row row--between">
        <div className="row">
          <h1 className="page-title">
            {offering.assetName} — {t.offeringsTitle}
          </h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="row">
          <span className="row text-sm muted">
            {t.tokenAddressLabel}: <Address value={offering.tokenAddress} />
          </span>
          {offering.state === "draft" && (
            <Button
              type="button"
              onClick={() => {
                act(() => api.openOffering(token, offering.id), t.offeringOpened);
              }}
            >
              {t.openOfferingAction}
            </Button>
          )}
          {offering.state === "open" && (
            <Button
              type="button"
              onClick={() => {
                act(() => api.closeOffering(token, offering.id), t.offeringClosed);
              }}
            >
              {t.closeOfferingAction}
            </Button>
          )}
        </div>
      </div>

      <div className="stat-row">
        <Stat label={t.supplyLabel} value={formatTokens(offering.supply)} />
        <Stat label={t.priceLabel} value={formatRial(offering.priceRial)} />
        <Stat label={t.subscribedLabel} value={formatTokens(offering.totalSubscribed)} />
        <Stat label={t.minimumRaiseLabel} value={formatTokens(offering.minimumRaise)} />
      </div>

      <Card title={t.offeringsTitle}>
        <div className="stack">
          <Progress
            value={Number(offering.totalSubscribed)}
            max={Number(offering.supply)}
            label={`${offering.totalSubscribed} / ${offering.supply}`}
          />
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>{t.minMaxLabel}</th>
                  <td className="num">
                    {formatTokens(offering.minPerInvestor)} –{" "}
                    {formatTokens(offering.maxPerInvestor)}
                  </td>
                </tr>
                <tr>
                  <th>{t.windowLabel}</th>
                  <td>
                    {formatDate(offering.opensAt)} → {formatDate(offering.closesAt)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
