"use client";

import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto, HolderRegistryDto } from "../lib/api";
import { formatDate, formatTokens, truncateAddress } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, SelectField } from "./ui/primitives";
import { useToast } from "./ui/toast";

const shareOf = (bps: number) => `${(bps / 100).toFixed(2)}%`;

// Client-side save of an already-fetched CSV (the API needs the bearer token,
// so a plain <a href> cannot carry the download).
const saveCsv = (filename: string, csvText: string) => {
  const url = URL.createObjectURL(new Blob([csvText], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

// FR-RA-1 (FR-PT-3 subset): the transfer-agent registry — who holds what,
// from when — rebuilt from chain events, reconciled against on-chain supply,
// exportable as CSV, with people instead of addresses (P2).
export const RegistryPanel = ({
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
  const [assets, setAssets] = useState<AssetViewDto[]>([]);
  const [assetId, setAssetId] = useState<string | undefined>(undefined);
  const [registry, setRegistry] = useState<HolderRegistryDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listAssets(token)
      .then((all) => {
        const tokenized = all.filter(
          (asset) => asset.state === "tokenized" && asset.tokenAddress !== undefined,
        );
        setAssets(tokenized);
        setAssetId((current) => current ?? tokenized[0]?.id);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [api, token]);

  useEffect(() => {
    if (assetId === undefined) {
      return;
    }
    setError(undefined);
    api
      .holderRegistry(token, assetId)
      .then(setRegistry)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      });
  }, [api, token, assetId, t.authFailed]);

  const download = (fetchCsv: () => Promise<{ filename: string; csv: string }>) => {
    setError(undefined);
    void (async () => {
      try {
        const file = await fetchCsv();
        saveCsv(file.filename, file.csv);
        toast.show(t.csvDownloaded, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  if (assets.length === 0) {
    return (
      <Card title={t.registryTitle}>
        <EmptyState icon="▤">{t.noTokenizedAssets}</EmptyState>
      </Card>
    );
  }

  return (
    <Card
      title={t.registryTitle}
      actions={
        <div className="row">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (assetId !== undefined) {
                download(() => api.registryCsv(token, assetId));
              }
            }}
          >
            {t.downloadRegistryButton}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (assetId !== undefined) {
                download(() => api.transfersCsv(token, assetId));
              }
            }}
          >
            {t.downloadHistoryButton}
          </Button>
        </div>
      }
    >
      <div className="stack">
        <SelectField
          id="registry-asset"
          label={t.assetLabel}
          value={assetId ?? ""}
          onChange={(e) => {
            setAssetId(e.target.value);
          }}
        >
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </SelectField>

        {registry !== undefined && (
          <>
            <div className="row" data-testid="registry-reconciliation">
              {registry.matchesChain ? (
                <Badge tone="success">{t.matchesChainLabel}</Badge>
              ) : (
                <Badge tone="danger">{t.mismatchLabel}</Badge>
              )}
              <span className="text-sm muted">
                {t.registryTotalLabel}: <span className="num">{registry.registryTotal}</span>
                {" · "}
                {t.onChainSupplyLabel}: <span className="num">{registry.onChainSupply}</span>
              </span>
            </div>

            {registry.holders.length === 0 ? (
              <EmptyState icon="▤">{t.noRegistryHolders}</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.holdersLabel}</th>
                      <th>{t.walletLabel}</th>
                      <th className="table__num">{t.tokensLabel}</th>
                      <th className="table__num">{t.shareLabel}</th>
                      <th>{t.holderSinceLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registry.holders.map((holder) => (
                      <tr key={holder.wallet} data-testid={`holder-${holder.wallet}`}>
                        <td>
                          {holder.email !== undefined ? (
                            <strong>{holder.email}</strong>
                          ) : (
                            <Badge tone="warning">{t.unknownHolderLabel}</Badge>
                          )}
                        </td>
                        <td className="mono text-sm">{truncateAddress(holder.wallet)}</td>
                        <td className="table__num num">{formatTokens(holder.tokens)}</td>
                        <td className="table__num num">{shareOf(holder.shareBps)}</td>
                        <td className="text-sm">{formatDate(holder.since)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {registry.history.length > 0 && (
              <div className="stack" style={{ gap: "var(--space-2)" }}>
                <p className="stat__label">{t.historyLabel}</p>
                {registry.history.map((event) => (
                  <div key={event.ref + event.at} className="row text-sm">
                    <Badge
                      tone={
                        event.kind === "mint"
                          ? "success"
                          : event.kind === "burn"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {event.kind}
                    </Badge>
                    <span>
                      {event.from !== undefined && event.to !== undefined
                        ? `${event.from} → ${event.to}`
                        : (event.from ?? event.to ?? "—")}
                    </span>
                    <span className="num">{formatTokens(event.tokens)}</span>
                    <span className="muted">{formatDate(event.at)}</span>
                    <span className="mono muted">{truncateAddress(event.ref)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
};
