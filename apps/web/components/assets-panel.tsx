"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Field } from "./ui/primitives";
import { assetStatus } from "./ui/status";
import { useToast } from "./ui/toast";

// FR-AO / FR-PT-3: the assets list. Onboarding a single asset happens on its
// own page (AssetDetailPage) — this view lists assets and proposes new ones.
export const AssetsPanel = ({
  locale,
  api,
  token,
  onOpenAsset,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  onOpenAsset: (assetId: string) => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [assets, setAssets] = useState<AssetViewDto[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setAssets(await api.listAssets(token));
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const propose = () => {
    setError(undefined);
    void (async () => {
      try {
        const created = await api.proposeAsset(token, name.trim());
        setName("");
        await refresh();
        toast.show(t.assetProposed, "success");
        onOpenAsset(created.assetId);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <Card
      title={t.assetsTitle}
      actions={
        <form
          className="row row--bottom"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() !== "") {
              propose();
            }
          }}
        >
          <Field
            id="asset-name"
            label={t.assetNameLabel}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <Button type="submit">{t.proposeAssetButton}</Button>
        </form>
      }
    >
      {assets.length === 0 ? (
        <EmptyState icon="◇">{t.noAssets}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.assetLabel}</th>
                <th>{t.statusLabel}</th>
                <th>{t.tokenAddressLabel}</th>
                <th>{t.dossierLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const status = assetStatus(asset.state);
                return (
                  <tr key={asset.id} data-testid={`asset-${asset.id}`}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          onOpenAsset(asset.id);
                        }}
                      >
                        <strong>{asset.name}</strong>
                      </button>
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="mono text-sm">
                      {asset.tokenAddress !== undefined ? (
                        <Address value={asset.tokenAddress} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="text-sm">
                      {asset.dossier.complete ? (
                        <Badge tone="success">{t.dossierCompleteLabel}</Badge>
                      ) : (
                        <span className="muted">
                          {t.missingKindsLabel}: {asset.dossier.missingKinds.length}
                        </span>
                      )}
                    </td>
                    <td className="table__num">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          onOpenAsset(asset.id);
                        }}
                      >
                        {t.openButton}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
};
