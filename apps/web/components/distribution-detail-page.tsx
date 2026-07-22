"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, DistributionViewDto } from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Stat } from "./ui/primitives";
import { distributionStatus } from "./ui/status";
import { useToast } from "./ui/toast";

// FR-YD / FR-PT-3: the distribution's own page — amount, reconciliation, and
// the full pro-rata payout breakdown, with the pay action inline.
export const DistributionDetailPage = ({
  locale,
  api,
  token,
  distributionId,
  onBack,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  distributionId: string;
  onBack: () => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [distribution, setDistribution] = useState<DistributionViewDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setDistribution(await api.getDistribution(token, distributionId));
  }, [api, token, distributionId]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const pay = () => {
    setError(undefined);
    void (async () => {
      try {
        await api.payDistribution(token, distributionId);
        await refresh();
        toast.show(t.distributionPaid, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  if (distribution === undefined) {
    return (
      <div className="stack">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.backToDistributions}
        </Button>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const status = distributionStatus(distribution.state);
  const r = distribution.reconciliation;

  return (
    <div className="stack">
      <Button variant="ghost" size="sm" onClick={onBack}>
        {t.backToDistributions}
      </Button>

      <div className="row row--between">
        <div className="row">
          <h1 className="page-title">
            {distribution.assetName} — {t.distributionsTitle}
          </h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {distribution.state === "declared" && (
          <Button type="button" onClick={pay}>
            {t.payDistributionAction}
          </Button>
        )}
      </div>

      <div className="stat-row">
        <Stat label={t.amountLabel} value={formatRial(distribution.totalAmountRial)} />
        <Stat label={t.allocatedLabel} value={formatRial(r.allocated)} />
        <Stat
          label={t.reconciliationLabel}
          value={r.balanced ? t.balancedLabel : t.mismatchLabel}
        />
      </div>

      <Card title={t.payoutsLabel}>
        {distribution.payouts.length === 0 ? (
          <EmptyState icon="◇">{t.noActivity}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.investorLabel}</th>
                  <th className="table__num">{t.tokensLabel}</th>
                  <th className="table__num">{t.amountLabel}</th>
                </tr>
              </thead>
              <tbody>
                {distribution.payouts.map((payout) => (
                  <tr key={payout.investorId}>
                    <td>{payout.email}</td>
                    <td className="table__num num">{formatTokens(payout.tokens)}</td>
                    <td className="table__num num">{formatRial(payout.amountRial)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
