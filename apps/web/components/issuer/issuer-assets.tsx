"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, AssetViewDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, Skeleton } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { assetStatus } from "../ui/status";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 3.3g: what this organisation has brought to the platform, from its own side.
// The same facts staff see on the onboarding screen, minus everything an
// issuer has no business acting on — this is a window, not a control panel.
export const IssuerAssets = ({
  locale,
  organisationId,
  csrf,
  api,
}: {
  locale: Locale;
  organisationId: string;
  csrf: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [name, setName] = useState("");
  // Undefined means "not answered yet". Distinguishing that from an empty
  // answer is the difference between "nothing yet" and "we could not ask".
  const [assets, setAssets] = useState<AssetViewDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setAssets(await api.issuerAssets(organisationId));
      setError(undefined);
    } catch (cause: unknown) {
      setError(messageOf(cause));
    }
  }, [api, organisationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bring = () => {
    const trimmed = name.trim();
    // An empty name is not a refusal worth reporting — it is nothing typed yet.
    if (trimmed === "") {
      return;
    }
    setError(undefined);
    void (async () => {
      try {
        await api.bringIssuerAsset(csrf, organisationId, trimmed);
        setName("");
        await refresh();
        toast.show(t.issuerAssetBrought, "success");
      } catch (cause: unknown) {
        // The platform's own words: an organisation that may not submit yet is
        // told exactly that, rather than left guessing at a silent failure.
        setError(messageOf(cause));
      }
    })();
  };

  const form = (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        bring();
      }}
    >
      <Field
        id="issuer-asset-name"
        label={t.issuerBringAssetLabel}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Button type="submit">{t.issuerBringAssetButton}</Button>
    </form>
  );

  if (assets === undefined && error !== undefined) {
    return (
      <Card title={t.issuerAssetsTitle}>
        <p className="field__error" role="alert">
          {error}
        </p>
      </Card>
    );
  }

  if (assets === undefined) {
    return <Skeleton lines={3} testId="issuer-assets-loading" />;
  }

  if (assets.length === 0) {
    return (
      <Card title={t.issuerAssetsTitle} actions={form}>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <EmptyState icon="▤">
          <span data-testid="no-issuer-assets">{t.issuerNoAssetsYet}</span>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card title={t.issuerAssetsTitle} subtitle={t.issuerAssetsSubtitle} actions={form}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.assetLabel}</th>
              <th>{t.statusLabel}</th>
              <th>{t.dossierLabel}</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const status = assetStatus(asset.state);
              return (
                <tr key={asset.id} data-testid={`issuer-asset-${asset.id}`}>
                  <td>
                    <strong>{asset.name}</strong>
                  </td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  {/* Counted, not listed: WHICH documents are missing is the
                      platform's review detail; the count is what tells an
                      issuer whether anything is owed. Same wording the admin
                      screen uses, so the two sides cannot drift apart. */}
                  <td>
                    {asset.dossier.complete ? (
                      <Badge tone="success">{t.dossierCompleteLabel}</Badge>
                    ) : (
                      <span className="muted">
                        {t.missingKindsLabel}: {asset.dossier.missingKinds.length}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
