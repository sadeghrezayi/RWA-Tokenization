"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field, SelectField } from "./ui/primitives";
import { assetStatus } from "./ui/status";

const DOCUMENT_KINDS = [
  "ownership_evidence",
  "spv_structure",
  "right_definition",
  "valuation_report",
  "counsel_signoff",
  "custody_agreement",
];

// FR-AO subset of the admin console (FR-PT-3): propose → structure →
// dossier/custody/checklist → approve → tokenize.
export const AssetsPanel = ({
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
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setAssets(await api.listAssets(token));
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  const guard = (action: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <Card title={t.assetsTitle}>
      <form
        className="field--row"
        style={{ marginBottom: "var(--space-5)" }}
        onSubmit={(event) => {
          event.preventDefault();
          guard(async () => {
            await api.proposeAsset(token, name);
            setName("");
          });
        }}
      >
        <div className="field" style={{ flex: 1, maxWidth: "24rem" }}>
          <label className="field__label" htmlFor="asset-name">
            {t.assetNameLabel}
          </label>
          <input
            id="asset-name"
            className="field__input"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <Button type="submit">{t.proposeAssetButton}</Button>
      </form>

      {assets.length === 0 ? (
        <EmptyState icon="◇">{t.noAssets}</EmptyState>
      ) : (
        <div className="stack">
          {assets.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              locale={locale}
              api={api}
              token={token}
              guard={guard}
            />
          ))}
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

const AssetRow = ({
  asset,
  locale,
  api,
  token,
  guard,
}: {
  asset: AssetViewDto;
  locale: Locale;
  api: ApiClient;
  token: string;
  guard: (action: () => Promise<void>) => void;
}) => {
  const t = dictionaries[locale];
  const [docKind, setDocKind] = useState(DOCUMENT_KINDS[0] ?? "");
  const [docTitle, setDocTitle] = useState("");
  const [custodian, setCustodian] = useState("");
  const [location, setLocation] = useState("");
  const [tokenizing, setTokenizing] = useState(false);
  const [symbol, setSymbol] = useState("");

  const structuring = asset.state === "in_structuring";
  const status = assetStatus(asset.state);

  return (
    <div
      data-testid={`asset-${asset.id}`}
      className="stack"
      style={{
        gap: "var(--space-3)",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "var(--space-4)",
      }}
    >
      <div className="row row--between">
        <div className="row">
          <strong>{asset.name}</strong>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="row">
          {asset.tokenAddress !== undefined && (
            <span className="row text-sm muted">
              {t.tokenAddressLabel}: <Address value={asset.tokenAddress} />
            </span>
          )}
          {asset.state === "approved" && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTokenizing(true);
              }}
            >
              {t.tokenizeAssetButton}
            </Button>
          )}
          {asset.state === "proposed" && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                guard(() => api.startStructuring(token, asset.id));
              }}
            >
              {t.startStructuringButton}
            </Button>
          )}
        </div>
      </div>

      {!asset.dossier.complete && asset.dossier.missingKinds.length > 0 && (
        <p className="text-sm muted">
          {t.missingKindsLabel}: {asset.dossier.missingKinds.join(", ")}
        </p>
      )}

      {structuring && (
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <form
            className="field--row"
            onSubmit={(event) => {
              event.preventDefault();
              guard(async () => {
                await api.attachAssetDocument(token, asset.id, {
                  kind: docKind,
                  title: docTitle,
                  contentBase64: btoa(`${docTitle} placeholder content`),
                });
                setDocTitle("");
              });
            }}
          >
            <SelectField
              id={`kind-${asset.id}`}
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
              <label className="field__label" htmlFor={`title-${asset.id}`}>
                {t.documentTitleLabel}
              </label>
              <input
                id={`title-${asset.id}`}
                className="field__input"
                required
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

          <form
            className="field--row"
            onSubmit={(event) => {
              event.preventDefault();
              guard(() =>
                api.recordCustody(token, asset.id, { custodianName: custodian, location }),
              );
            }}
          >
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor={`custodian-${asset.id}`}>
                {t.custodianLabel}
              </label>
              <input
                id={`custodian-${asset.id}`}
                className="field__input"
                required
                value={custodian}
                onChange={(e) => {
                  setCustodian(e.target.value);
                }}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor={`location-${asset.id}`}>
                {t.custodyLocationLabel}
              </label>
              <input
                id={`location-${asset.id}`}
                className="field__input"
                required
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                }}
              />
            </div>
            <Button type="submit" variant="secondary">
              {t.recordCustodyButton}
            </Button>
          </form>

          <div className="row">
            <span className="text-sm muted">{t.checklistLabel}:</span>
            {asset.checklist.confirmed.map((item) => (
              <Badge key={item} tone="success">
                {item}
              </Badge>
            ))}
            {asset.checklist.unconfirmed.map((item) => (
              <Button
                key={item}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  guard(() => api.confirmChecklistItem(token, asset.id, item));
                }}
              >
                {item}
              </Button>
            ))}
          </div>

          <div>
            <Button
              type="button"
              onClick={() => {
                guard(() => api.approveAsset(token, asset.id));
              }}
            >
              {t.approveAssetButton}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={tokenizing}
        title={`${t.tokenizeAssetButton} — ${asset.name}`}
        onClose={() => {
          setTokenizing(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setTokenizing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (symbol.trim() !== "") {
                  const sym = symbol.trim().toUpperCase();
                  setTokenizing(false);
                  setSymbol("");
                  guard(async () => {
                    await api.tokenizeAsset(token, asset.id, sym);
                  });
                }
              }}
            >
              {t.tokenizeAssetButton}
            </Button>
          </>
        }
      >
        <Field
          id={`symbol-${asset.id}`}
          label={t.tokenSymbolLabel}
          hint="2–11 uppercase letters or digits."
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value);
          }}
        />
      </Modal>
    </div>
  );
};
