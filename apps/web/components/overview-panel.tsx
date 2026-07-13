"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../lib/api";
import type {
  ApiClient,
  AssetOverviewDto,
  AttestationViewDto,
  PortfolioOverviewDto,
  SystemHealthDto,
} from "../lib/api";
import { formatDate, formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import type { BadgeTone } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field, SelectField, Stat } from "./ui/primitives";
import { assetStatus, distributionStatus, offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

const KINDS = ["valuation", "nav", "rent", "reserve"];

// FR-RA / FR-PT-3 + FR-OR: portfolio reporting, service/contract health, and
// signed valuations (latest + history) with honest freshness.
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
  const toast = useToast();
  const [portfolio, setPortfolio] = useState<PortfolioOverviewDto | undefined>(undefined);
  const [health, setHealth] = useState<SystemHealthDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const [attestFor, setAttestFor] = useState<AssetOverviewDto | undefined>(undefined);

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

  const guard = (action: () => Promise<void>, successMsg?: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        if (successMsg) toast.show(successMsg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

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

      <Card title={t.totalAssetsLabel}>
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
                  <th>{t.valuationLabel}</th>
                  <th className="table__num">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.assets.map((asset) => (
                  <FragmentRow
                    key={asset.id}
                    asset={asset}
                    locale={locale}
                    api={api}
                    token={token}
                    open={expanded === asset.id}
                    onToggle={() => {
                      setExpanded(expanded === asset.id ? undefined : asset.id);
                    }}
                    onAttest={() => {
                      setAttestFor(asset);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AttestModal
        asset={attestFor}
        locale={locale}
        onClose={() => {
          setAttestFor(undefined);
        }}
        onPublish={(body) => {
          setAttestFor(undefined);
          guard(async () => {
            await api.publishAttestation(token, body);
          }, t.attestationPublished);
        }}
      />
    </div>
  );
};

const ValuationCell = ({ asset, locale }: { asset: AssetOverviewDto; locale: Locale }) => {
  const t = dictionaries[locale];
  const v = asset.latestValuation;
  if (!v) return <span className="muted text-sm">{t.noValuation}</span>;
  return (
    <div className="row" style={{ gap: "var(--space-2)" }}>
      <span className="num">{formatRial(v.valueRial)}</span>
      <Badge tone={v.fresh ? "success" : "warning"}>{v.fresh ? t.freshLabel : t.staleLabel}</Badge>
      <span className="muted text-sm">
        {t.asOfLabel} {formatDate(v.asOf)}
      </span>
    </div>
  );
};

const FragmentRow = ({
  asset,
  locale,
  api,
  token,
  open,
  onToggle,
  onAttest,
}: {
  asset: AssetOverviewDto;
  locale: Locale;
  api: ApiClient;
  token: string;
  open: boolean;
  onToggle: () => void;
  onAttest: () => void;
}) => {
  const t = dictionaries[locale];
  const status = assetStatus(asset.state);
  const [attestations, setAttestations] = useState<AttestationViewDto[] | undefined>(undefined);

  useEffect(() => {
    if (open && attestations === undefined) {
      api
        .listAttestations(token, asset.id)
        .then(setAttestations)
        .catch(() => {
          setAttestations([]);
        });
    }
  }, [open, attestations, api, token, asset.id]);

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
          <Badge tone={status.tone}>{status.label}</Badge>
        </td>
        <td className="table__num">{formatTokens(asset.circulatingSupply)}</td>
        <td className="table__num">{asset.holderCount}</td>
        <td className="table__num">{formatRial(asset.totalRaisedRial)}</td>
        <td>
          <ValuationCell asset={asset} locale={locale} />
        </td>
        <td className="table__num">
          <div className="table__actions">
            <Button type="button" size="sm" variant="secondary" onClick={onAttest}>
              {t.attestButton}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onToggle}>
              {t.detailsLabel}
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-2)" }}>
            <div className="stack" style={{ gap: "var(--space-4)" }}>
              <Section title={t.offeringsTitle}>
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
              </Section>
              <Section title={t.distributionsTitle}>
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
              </Section>
              <Section title={t.valuationsLabel}>
                {!attestations || attestations.length === 0 ? (
                  <p className="muted text-sm">—</p>
                ) : (
                  <ul className="stack" style={{ gap: "var(--space-2)", listStyle: "none" }}>
                    {attestations.map((a) => (
                      <li key={a.id} className="row text-sm">
                        <Badge tone="neutral">{a.kind}</Badge>
                        <Badge tone={a.fresh ? "success" : "warning"}>
                          {a.fresh ? t.freshLabel : t.staleLabel}
                        </Badge>
                        <span>
                          {formatRial(a.valueRial)} · {t.asOfLabel} {formatDate(a.asOf)}
                        </span>
                        <Address value={a.payloadHash} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <p className="stat__label">{title}</p>
    {children}
  </div>
);

const AttestModal = ({
  asset,
  locale,
  onClose,
  onPublish,
}: {
  asset: AssetOverviewDto | undefined;
  locale: Locale;
  onClose: () => void;
  onPublish: (body: {
    assetId: string;
    kind: string;
    valueRial: string;
    validUntil: string;
    documentCid?: string;
  }) => void;
}) => {
  const t = dictionaries[locale];
  const [kind, setKind] = useState("valuation");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState("2027-12-31");
  const [documentCid, setDocumentCid] = useState("");

  return (
    <Modal
      open={asset !== undefined}
      title={asset ? `${t.publishAttestationTitle} — ${asset.name}` : t.publishAttestationTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (asset && value.trim() !== "") {
                onPublish({
                  assetId: asset.id,
                  kind,
                  valueRial: value.trim(),
                  validUntil: new Date(`${validUntil}T00:00:00.000Z`).toISOString(),
                  ...(documentCid.trim() !== "" ? { documentCid: documentCid.trim() } : {}),
                });
                setValue("");
                setDocumentCid("");
              }
            }}
          >
            {t.publishAttestationTitle}
          </Button>
        </>
      }
    >
      <SelectField
        id="attest-kind"
        label={t.attestationKindLabel}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value);
        }}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </SelectField>
      <Field
        id="attest-value"
        label={`${t.valueLabel} (﷼)`}
        type="number"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <Field
        id="attest-valid-until"
        label={t.validUntilLabel}
        type="date"
        value={validUntil}
        onChange={(e) => {
          setValidUntil(e.target.value);
        }}
      />
      <Field
        id="attest-doc"
        label={t.documentCidLabel}
        value={documentCid}
        onChange={(e) => {
          setDocumentCid(e.target.value);
        }}
      />
    </Modal>
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
