"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, PortfolioDto } from "../../lib/api";
import { formatDate, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { AllocationBar } from "../ui/allocation-bar";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton, Stat } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 2.5b: the holder's own position, stated as facts they can check.
//
// Every value carries the date of the attestation behind it, and says when that
// attestation has gone out of date. There is deliberately nothing
// forward-looking here — no projected yield, no expected return (OD-21) — and
// income means money that was actually paid.
export const PortfolioSummary = ({ locale, api }: { locale: Locale; api: ApiClient }) => {
  const t = dictionaries[locale];
  const [portfolio, setPortfolio] = useState<PortfolioDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

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
        <Skeleton lines={3} testId="portfolio-loading" />
      </Card>
    );
  }

  const valued = portfolio.valuedAt !== undefined;
  const stale = valued && !portfolio.portfolioValueFresh;

  return (
    <div className="stack">
      <Card
        title={t.portfolioSummaryTitle}
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
            <Stat
              label={t.portfolioInvestedLabel}
              value={formatRial(portfolio.totalInvestedRial)}
            />
            <Stat
              label={t.portfolioValueLabel}
              value={valued ? formatRial(portfolio.portfolioValueRial) : "—"}
              hint={
                valued
                  ? `${t.portfolioValuedAt} ${formatDate(portfolio.valuedAt)}`
                  : t.portfolioNotValued
              }
            />
            <Stat
              label={t.portfolioIncomeLabel}
              value={formatRial(portfolio.incomeReceivedRial)}
              hint={t.portfolioIncomeHint}
            />
          </div>

          {stale && (
            <p className="callout callout--warning" role="status">
              {t.portfolioStaleExplainer}
            </p>
          )}
          {!valued && portfolio.holdings.length > 0 && (
            <p className="muted">{t.portfolioNotValuedExplainer}</p>
          )}
        </div>
      </Card>

      <Card title={t.portfolioAllocationTitle}>
        <div className="stack">
          <AllocationBar
            segments={portfolio.holdings
              .filter((holding) => holding.shareBasisPoints !== undefined)
              .map((holding) => ({
                id: holding.assetId,
                label: holding.assetName,
                basisPoints: holding.shareBasisPoints ?? 0,
                value: formatRial(holding.valueRial ?? "0"),
              }))}
            emptyLabel={t.portfolioNoAllocation}
          />

          {portfolio.holdings.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.assetLabel}</th>
                    <th className="table__num">{t.tokensLabel}</th>
                    <th className="table__num">{t.portfolioValueLabel}</th>
                    <th>{t.portfolioValuedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((holding) => (
                    <tr key={holding.assetId} data-testid={`portfolio-${holding.assetId}`}>
                      <td>
                        <strong>{holding.assetName}</strong>
                      </td>
                      <td className="table__num num">{formatTokens(holding.tokens)}</td>
                      <td className="table__num num">
                        {holding.valueRial !== undefined ? formatRial(holding.valueRial) : "—"}
                      </td>
                      <td>
                        {holding.valuedAt !== undefined ? (
                          <span className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                            {formatDate(holding.valuedAt)}
                            {!holding.valuationFresh && (
                              <Badge tone="warning">{t.portfolioValueStale}</Badge>
                            )}
                          </span>
                        ) : (
                          <span className="muted">{t.portfolioNotValued}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title={t.portfolioIncomeTitle} subtitle={t.portfolioIncomeSubtitle}>
        {portfolio.income.length === 0 ? (
          <EmptyState icon="◇">{t.portfolioNoIncome}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.portfolioPaidAt}</th>
                  <th>{t.assetLabel}</th>
                  <th className="table__num">{t.amountLabel}</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.income.map((item) => (
                  <tr key={item.distributionId} data-testid={`income-${item.distributionId}`}>
                    <td>{formatDate(item.paidAt)}</td>
                    <td>{item.assetName}</td>
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
