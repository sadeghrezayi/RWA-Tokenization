"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Field, SelectField } from "./ui/primitives";
import { assetStatus } from "./ui/status";
import { useToast } from "./ui/toast";

const DOCUMENT_KINDS = [
  "ownership_evidence",
  "spv_structure",
  "right_definition",
  "valuation_report",
  "counsel_signoff",
  "custody_agreement",
];

// FR-AO / FR-PT-3: the asset's own page — full legal dossier, custody,
// onboarding checklist, lifecycle, and token — with every onboarding action
// inline (no popups). Replaces the crammed accordion row in the old list.
export const AssetDetailPage = ({
  locale,
  api,
  token,
  assetId,
  onBack,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  assetId: string;
  onBack: () => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [asset, setAsset] = useState<AssetViewDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [docKind, setDocKind] = useState(DOCUMENT_KINDS[0] ?? "");
  const [docTitle, setDocTitle] = useState("");
  const [custodian, setCustodian] = useState("");
  const [custodyLocation, setCustodyLocation] = useState("");
  const [symbol, setSymbol] = useState("");

  const refresh = useCallback(async () => {
    setAsset(await api.getAsset(token, assetId));
  }, [api, token, assetId]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const guard = (action: () => Promise<void>, msg: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        toast.show(msg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  if (asset === undefined) {
    return (
      <div className="stack">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.backToAssets}
        </Button>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const status = assetStatus(asset.state);
  const structuring = asset.state === "in_structuring";

  return (
    <div className="stack">
      <Button variant="ghost" size="sm" onClick={onBack}>
        {t.backToAssets}
      </Button>

      <div className="row row--between">
        <div className="row">
          <h1 className="page-title">{asset.name}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="row">
          {asset.tokenAddress !== undefined && (
            <span className="row text-sm muted">
              {t.tokenAddressLabel}: <Address value={asset.tokenAddress} />
            </span>
          )}
          {asset.state === "proposed" && (
            <Button
              type="button"
              onClick={() => {
                guard(() => api.startStructuring(token, asset.id), t.structuringStarted);
              }}
            >
              {t.startStructuringButton}
            </Button>
          )}
          {asset.state === "approved" && (
            <span className="row row--bottom">
              <Field
                id="asset-symbol"
                label={t.tokenSymbolLabel}
                hint="2–11 uppercase letters or digits."
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  if (symbol.trim() !== "") {
                    const sym = symbol.trim().toUpperCase();
                    setSymbol("");
                    guard(async () => {
                      await api.tokenizeAsset(token, asset.id, sym);
                    }, t.assetTokenized);
                  }
                }}
              >
                {t.tokenizeAssetButton}
              </Button>
            </span>
          )}
        </div>
      </div>

      <div className="grid-2">
        <Card title={t.dossierLabel}>
          <div className="stack">
            {asset.dossier.documents.length === 0 ? (
              <EmptyState icon="◇">{t.noDocuments}</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.documentKindLabel}</th>
                      <th>{t.documentTitleLabel}</th>
                      <th>{t.documentRefLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.dossier.documents.map((doc) => (
                      <tr key={`${doc.kind}-${doc.cid}`}>
                        <td className="text-sm">{doc.kind}</td>
                        <td>{doc.title}</td>
                        <td className="mono text-sm">
                          <Address value={doc.cid} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!asset.dossier.complete && asset.dossier.missingKinds.length > 0 && (
              <p className="text-sm muted">
                {t.missingKindsLabel}: {asset.dossier.missingKinds.join(", ")}
              </p>
            )}
            {structuring && (
              <form
                className="row row--bottom"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (docTitle.trim() !== "") {
                    guard(async () => {
                      await api.attachAssetDocument(token, asset.id, {
                        kind: docKind,
                        title: docTitle.trim(),
                        contentBase64: btoa(`${docTitle} placeholder content`),
                      });
                      setDocTitle("");
                    }, t.documentAttached);
                  }
                }}
              >
                <SelectField
                  id="doc-kind"
                  label={t.documentKindLabel}
                  value={docKind}
                  onChange={(e) => {
                    setDocKind(e.target.value);
                  }}
                >
                  {DOCUMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </SelectField>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="doc-title">
                    {t.documentTitleLabel}
                  </label>
                  <input
                    id="doc-title"
                    className="field__input"
                    value={docTitle}
                    onChange={(e) => {
                      setDocTitle(e.target.value);
                    }}
                  />
                </div>
                <Button type="submit" variant="secondary">
                  {t.attachDocumentButton}
                </Button>
              </form>
            )}
          </div>
        </Card>

        <Card title={t.custodyLabel}>
          <div className="stack">
            {asset.custody !== undefined ? (
              <div className="stack" style={{ gap: "var(--space-1)" }}>
                <p>
                  <strong>{asset.custody.custodianName}</strong>
                </p>
                <p className="text-sm muted">{asset.custody.location}</p>
              </div>
            ) : (
              <EmptyState icon="⛨">{t.noCustody}</EmptyState>
            )}
            {structuring && (
              <form
                className="stack"
                style={{ gap: "var(--space-2)" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (custodian.trim() !== "" && custodyLocation.trim() !== "") {
                    guard(
                      () =>
                        api.recordCustody(token, asset.id, {
                          custodianName: custodian.trim(),
                          location: custodyLocation.trim(),
                        }),
                      t.custodyRecorded,
                    );
                  }
                }}
              >
                <Field
                  id="custodian"
                  label={t.custodianLabel}
                  value={custodian}
                  onChange={(e) => {
                    setCustodian(e.target.value);
                  }}
                />
                <Field
                  id="custody-location"
                  label={t.custodyLocationLabel}
                  value={custodyLocation}
                  onChange={(e) => {
                    setCustodyLocation(e.target.value);
                  }}
                />
                <div>
                  <Button type="submit" variant="secondary">
                    {t.recordCustodyButton}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      </div>

      <Card title={t.checklistLabel}>
        <div className="stack">
          <div className="row row--wrap">
            {asset.checklist.confirmed.map((item) => (
              <Badge key={item} tone="success">
                {item} ✓
              </Badge>
            ))}
            {asset.checklist.confirmed.length === 0 && asset.checklist.unconfirmed.length === 0 && (
              <span className="muted text-sm">{t.noChecklist}</span>
            )}
          </div>
          {structuring && asset.checklist.unconfirmed.length > 0 && (
            <div className="row row--wrap">
              {asset.checklist.unconfirmed.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    guard(
                      () => api.confirmChecklistItem(token, asset.id, item),
                      t.checklistConfirmed,
                    );
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
          )}
          {structuring && (
            <div>
              <Button
                type="button"
                onClick={() => {
                  guard(() => api.approveAsset(token, asset.id), t.assetApproved);
                }}
              >
                {t.approveAssetButton}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
