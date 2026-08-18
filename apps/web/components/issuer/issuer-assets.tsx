"use client";

import { useEffect, useState } from "react";
import type { ApiClient, AssetViewDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton } from "../ui/primitives";
import { assetStatus } from "../ui/status";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 3.3g: what this organisation has brought to the platform, from its own side.
// The same facts staff see on the onboarding screen, minus everything an
// issuer has no business acting on — this is a window, not a control panel.
export const IssuerAssets = ({
  locale,
  organisationId,
  api,
}: {
  locale: Locale;
  organisationId: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  // Undefined means "not answered yet". Distinguishing that from an empty
  // answer is the difference between "nothing yet" and "we could not ask".
  const [assets, setAssets] = useState<AssetViewDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void api
      .issuerAssets(organisationId)
      .then(setAssets)
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      });
  }, [api, organisationId]);

  if (error !== undefined) {
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
      <Card title={t.issuerAssetsTitle}>
        <EmptyState icon="▤">
          <span data-testid="no-issuer-assets">{t.issuerNoAssetsYet}</span>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card title={t.issuerAssetsTitle} subtitle={t.issuerAssetsSubtitle}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.assetLabel}</th>
              <th>{t.statusLabel}</th>
              <th>{t.legalDossierLabel}</th>
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
                  {/* Counted, not listed: which documents are missing is the
                      platform's review detail, and the count is what tells an
                      issuer whether anything is owed. */}
                  <td>
                    {asset.missingDocuments.length === 0
                      ? t.issuerDossierComplete
                      : `${t.missingLabel}: ${String(asset.missingDocuments.length)}`}
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
