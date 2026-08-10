"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { InvestorDocumentDto, PortfolioDto } from "../../lib/api";
import type { ApiClient } from "../../lib/api";
import { formatDate, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton, Stat } from "../ui/primitives";
import { offeringStatus } from "../ui/status";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const UNKNOWN = "—";

const sum = (values: string[]): string =>
  String(values.reduce((total, value) => total + BigInt(value), 0n));

// 2.5c: one asset, everything the holder's own record says about it — what they
// put in, what the latest ATTESTED valuation makes it worth (with its date), and
// what it has actually paid out.
//
// It reads the portfolio the holder already has rather than adding an endpoint:
// the position is a slice of that record, not a different set of facts. A
// position with no tokens left is still reachable — a redeemed holding does not
// erase the money that went in or the income that came out.
export const PositionCard = ({
  locale,
  api,
  assetId,
}: {
  locale: Locale;
  api: ApiClient;
  assetId: string;
}) => {
  const t = dictionaries[locale];
  const [portfolio, setPortfolio] = useState<PortfolioDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [documents, setDocuments] = useState<InvestorDocumentDto[] | undefined>(undefined);
  const [documentsError, setDocumentsError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setPortfolio(await api.getPortfolio());
      setError(undefined);
    } catch (loadError) {
      // "Could not read your portfolio" must never look like "you hold nothing".
      setError(messageOf(loadError));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Documents load on their own: a failure to fetch them must not blank out
  // the money figures beside them.
  useEffect(() => {
    void (async () => {
      try {
        setDocuments(await api.myAssetDocuments(assetId));
        setDocumentsError(undefined);
      } catch (loadError) {
        setDocumentsError(messageOf(loadError));
      }
    })();
  }, [api, assetId]);

  if (error !== undefined) {
    return (
      <Card title={t.portfolioSummaryTitle}>
        <p className="field__error" role="alert">
          {error}
        </p>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card title={t.portfolioSummaryTitle}>
        <Skeleton lines={3} testId="position-loading" />
      </Card>
    );
  }

  const holding = portfolio.holdings.find((item) => item.assetId === assetId);
  const income = portfolio.income.filter((item) => item.assetId === assetId);
  const subscriptions = portfolio.subscriptions.filter((item) => item.assetId === assetId);

  if (!holding && income.length === 0 && subscriptions.length === 0) {
    return (
      <Card title={t.portfolioSummaryTitle}>
        <div className="stack">
          <EmptyState icon="◇">{t.positionNone}</EmptyState>
          <p>
            <Link href={`/${locale}/portfolio`}>{t.positionBack}</Link>
          </p>
        </div>
      </Card>
    );
  }

  // The name comes from whichever record survives: a fully redeemed position
  // has no holding left, but its subscriptions still name the asset.
  const assetName = holding?.assetName ?? subscriptions[0]?.assetName ?? income[0]?.assetName;
  // A value is only ever shown with the date behind it; a holding with no
  // attestation shows "not yet valued" rather than a zero.
  const valueLabel = holding?.valueRial !== undefined ? formatRial(holding.valueRial) : UNKNOWN;
  const valued = valueLabel !== UNKNOWN;
  const stale = holding?.valueRial !== undefined && !holding.valuationFresh;

  return (
    <div className="stack">
      <Card
        title={assetName ?? assetId}
        actions={
          valued ? (
            <Badge tone={stale ? "warning" : "success"}>
              {stale ? t.portfolioValueStale : t.portfolioValueFresh}
            </Badge>
          ) : undefined
        }
      >
        <div className="stack">
          <div className="stat-row">
            <div data-testid="position-tokens">
              <Stat label={t.positionTokensLabel} value={formatTokens(holding?.tokens ?? "0")} />
            </div>
            <div data-testid="position-value">
              <Stat
                label={t.positionValueLabel}
                value={valueLabel}
                hint={
                  holding?.valuedAt !== undefined
                    ? `${t.portfolioValuedAt} ${formatDate(holding.valuedAt)}`
                    : t.portfolioNotValued
                }
              />
            </div>
            <div data-testid="position-invested">
              <Stat
                label={t.positionInvestedLabel}
                value={formatRial(sum(subscriptions.map((item) => item.costRial)))}
              />
            </div>
            <div data-testid="position-income">
              <Stat
                label={t.positionIncomeLabel}
                value={formatRial(sum(income.map((item) => item.amountRial)))}
                hint={t.portfolioIncomeHint}
              />
            </div>
          </div>

          {stale && (
            <p className="callout callout--warning" role="status">
              {t.portfolioStaleExplainer}
            </p>
          )}
          <p>
            <Link href={`/${locale}/portfolio`}>{t.positionBack}</Link>
          </p>
        </div>
      </Card>

      <Card title={t.positionHistoryTitle} subtitle={t.positionHistorySubtitle}>
        {subscriptions.length === 0 ? (
          <EmptyState icon="◇">{t.noActivity}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.whenLabel}</th>
                  <th>{t.statusLabel}</th>
                  <th className="table__num">{t.requestedLabel}</th>
                  <th className="table__num">{t.allocatedLabel}</th>
                  <th className="table__num">{t.costLabel}</th>
                  <th className="table__num">{t.refundLabel}</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((item) => {
                  const status = offeringStatus(item.state);
                  return (
                    <tr key={item.offeringId} data-testid={`subscription-${item.offeringId}`}>
                      <td>{formatDate(item.closesAt)}</td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="table__num num">{formatTokens(item.requested)}</td>
                      <td className="table__num num">{formatTokens(item.allocated)}</td>
                      <td className="table__num num">{formatRial(item.costRial)}</td>
                      <td className="table__num num">{formatRial(item.refundRial)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t.positionDocumentsTitle} subtitle={t.positionDocumentsSubtitle}>
        {documentsError !== undefined ? (
          <p className="field__error" role="alert">
            {documentsError}
          </p>
        ) : documents === undefined ? (
          <Skeleton lines={2} testId="position-documents-loading" />
        ) : documents.length === 0 ? (
          <EmptyState icon="◫">{t.positionNoDocuments}</EmptyState>
        ) : (
          <ul className="list">
            {documents.map((document) => (
              <li key={document.cid} className="list__row">
                <span>{document.title}</span>
                <span className="muted text-sm">{document.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.portfolioIncomeTitle} subtitle={t.portfolioIncomeSubtitle}>
        {income.length === 0 ? (
          <EmptyState icon="◇">{t.portfolioNoIncome}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.portfolioPaidAt}</th>
                  <th className="table__num">{t.amountLabel}</th>
                </tr>
              </thead>
              <tbody>
                {income.map((item) => (
                  <tr key={item.distributionId} data-testid={`income-${item.distributionId}`}>
                    <td>{formatDate(item.paidAt)}</td>
                    <td className="table__num num">{formatRial(item.amountRial)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
