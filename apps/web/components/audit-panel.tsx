"use client";

import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto, AuditEventDto } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Card, EmptyState, SelectField } from "./ui/primitives";

const ALL = "";

// FR-RA-2 (FR-PT-3 subset): every privileged action, newest first — actor,
// asset, timestamp, and structured details — filterable per asset.
export const AuditPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [assets, setAssets] = useState<AssetViewDto[]>([]);
  const [assetId, setAssetId] = useState<string>(ALL);
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listAssets(token)
      .then(setAssets)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [api, token]);

  useEffect(() => {
    setError(undefined);
    api
      .auditTrail(token, assetId === ALL ? {} : { assetId })
      .then(setEvents)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      });
  }, [api, token, assetId, t.authFailed]);

  return (
    <Card title={t.auditTitle}>
      <div className="stack">
        <SelectField
          id="audit-asset"
          label={t.assetLabel}
          value={assetId}
          onChange={(e) => {
            setAssetId(e.target.value);
          }}
        >
          <option value={ALL}>{t.allAssetsLabel}</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </SelectField>

        {events.length === 0 ? (
          <EmptyState icon="≡">{t.noAuditEvents}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.whenLabel}</th>
                  <th>{t.assetLabel}</th>
                  <th>{t.eventLabel}</th>
                  <th>{t.actorLabel}</th>
                  <th>{t.detailsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} data-testid={`audit-${event.id}`}>
                    <td className="text-sm num">{formatDateTime(event.at)}</td>
                    <td>{event.assetName}</td>
                    <td className="mono text-sm">{event.event}</td>
                    <td className="text-sm">{event.actor}</td>
                    <td className="text-sm muted">
                      {Object.entries(event.details)
                        .map(([key, value]) => `${key}=${value}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
