"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApiClient,
  AssetOverviewDto,
  PortfolioOverviewDto,
  SystemHealthDto,
} from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import type { BadgeTone } from "./ui/badge";
import { Button, Card, EmptyState, Stat } from "./ui/primitives";
import { assetStatus, distributionStatus, offeringStatus } from "./ui/status";

// FR-RA / FR-PT-3: portfolio-wide reporting + service/contract health for the
// operator — every asset's supply, holders, raised, and distribution history.
export const OverviewPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [portfolio, setPortfolio] = useState<PortfolioOverviewDto | undefined>(undefined);
  const [health, setHealth] = useState<SystemHealthDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([api.assetOverview(token), api.systemHealth(token)]);
    setPortfolio(p);
    setHealth(h);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  if (error !== undefined) {
    return (
      <Card title={t.overviewTitle}>
        <p className="field__error" role="alert">
          {error}
        </p>
      </Card>
    );
  }

  return (
    <div className="stack">
      {health && <HealthStrip locale={locale} health={health} />}

      {portfolio && (
        <div className="grid grid--2">
          <Stat label={t.totalAssetsLabel} value={String(portfolio.summary.assetCount)} />
          <Stat label={t.tokenizedLabel} value={String(portfolio.summary.tokenizedCount)} />
          <Stat label={t.totalRaisedLabel} value={formatRial(portfolio.summary.totalRaisedRial)} />
          <Stat
            label={t.totalDistributedLabel}
            value={formatRial(portfolio.summary.totalDistributedRial)}
          />
        </div>
      )}

      <Card title={t.assetsTitle}>
        {!portfolio || portfolio.assets.length === 0 ? (
          <EmptyState icon="◇">{t.noOverviewAssets}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.assetLabel}</th>
                  <th>{t.statusLabel}</th>
                  <th className="table__num">{t.circulatingLabel}</th>
                  <th className="table__num">{t.holdersLabel}</th>
                  <th className="table__num">{t.raisedLabel}</th>
                  <th className="table__num">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.assets.map((asset) => {
                  const status = assetStatus(asset.state);
                  const open = expanded === asset.id;
                  return (
                    <FragmentRow
                      key={asset.id}
                      asset={asset}
                      locale={locale}
                      statusTone={status.tone}
                      statusLabel={status.label}
                      open={open}
                      onToggle={() => {
                        setExpanded(open ? undefined : asset.id);
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const FragmentRow = ({
  asset,
  locale,
  statusTone,
  statusLabel,
  open,
  onToggle,
}: {
  asset: AssetOverviewDto;
  locale: Locale;
  statusTone: BadgeTone;
  statusLabel: string;
  open: boolean;
  onToggle: () => void;
}) => {
  const t = dictionaries[locale];
  return (
    <>
      <tr data-testid={`overview-asset-${asset.id}`}>
        <td>
          <div className="row">
            <strong>{asset.name}</strong>
            {asset.tokenAddress !== undefined && <Address value={asset.tokenAddress} />}
          </div>
        </td>
        <td>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </td>
        <td className="table__num">{formatTokens(asset.circulatingSupply)}</td>
        <td className="table__num">{asset.holderCount}</td>
        <td className="table__num">{formatRial(asset.totalRaisedRial)}</td>
        <td className="table__num">
          <Button type="button" size="sm" variant="secondary" onClick={onToggle}>
            {t.detailsLabel}
          </Button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-2)" }}>
            <div className="stack" style={{ gap: "var(--space-4)" }}>
              <div>
                <p className="stat__label">{t.offeringsTitle}</p>
                {asset.offerings.length === 0 ? (
                  <p className="muted text-sm">—</p>
                ) : (
                  <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none" }}>
                    {asset.offerings.map((o) => {
                      const sold = BigInt(o.subscribed);
                      const remaining = BigInt(o.supply) - sold;
                      const st = offeringStatus(o.state);
                      return (
                        <li key={o.id} className="row text-sm">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          <span>
                            {t.soldLabel}: {formatTokens(sold.toString())} · {t.remainingLabel}:{" "}
                            {formatTokens(remaining.toString())} · {formatRial(o.priceRial)}/token
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="stat__label">{t.distributionsTitle}</p>
                {asset.distributions.length === 0 ? (
                  <p className="muted text-sm">—</p>
                ) : (
                  <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none" }}>
                    {asset.distributions.map((d) => {
                      const st = distributionStatus(d.state);
                      return (
                        <li key={d.id} className="row text-sm">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          <span>{formatRial(d.totalAmountRial)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const HealthStrip = ({ locale, health }: { locale: Locale; health: SystemHealthDto }) => {
  const t = dictionaries[locale];
  const serviceTone = (s: string): BadgeTone => (s === "up" ? "success" : "danger");
  const services: [string, string][] = [
    ["API", health.services.api],
    ["Postgres", health.services.postgres],
    ["IPFS", health.services.ipfs],
    ["Chain", health.services.chain],
  ];
  return (
    <Card
      title={t.healthTitle}
      actions={
        <Badge tone={health.overall === "healthy" ? "success" : "danger"}>
          {health.overall === "healthy" ? t.healthyLabel : t.degradedLabel}
        </Badge>
      }
    >
      <div className="row" style={{ gap: "var(--space-4)" }}>
        {services.map(([name, state]) => (
          <span key={name} className="row text-sm" style={{ gap: "var(--space-2)" }}>
            <Badge tone={serviceTone(state)}>{name}</Badge>
          </span>
        ))}
        {health.chainBlockNumber !== undefined && (
          <span className="text-sm muted num">
            {t.blockLabel} #{health.chainBlockNumber}
          </span>
        )}
        <span className="text-sm muted">
          {t.pausedTokensLabel}: {health.pausedTokens}
        </span>
      </div>
    </Card>
  );
};
