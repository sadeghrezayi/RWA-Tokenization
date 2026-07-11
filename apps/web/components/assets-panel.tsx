"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

const DOCUMENT_KINDS = [
  "ownership_evidence",
  "spv_structure",
  "right_definition",
  "valuation_report",
  "counsel_signoff",
  "custody_agreement",
];

// FR-AO subset of the admin console (FR-PT-3): propose → structure →
// dossier/custody/checklist → approve.
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
    <section className="card">
      <h2>{t.assetsTitle}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          guard(async () => {
            await api.proposeAsset(token, name);
            setName("");
          });
        }}
      >
        <label htmlFor="asset-name">{t.assetNameLabel}</label>
        <input
          id="asset-name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <button type="submit">{t.proposeAssetButton}</button>
      </form>

      {assets.length === 0 ? (
        <p>{t.noAssets}</p>
      ) : (
        <ul>
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
        </ul>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
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

  const structuring = asset.state === "in_structuring";

  return (
    <li data-testid={`asset-${asset.id}`}>
      <strong>{asset.name}</strong> — <span>{asset.state}</span>
      {!asset.dossier.complete && asset.dossier.missingKinds.length > 0 && (
        <p>
          {t.missingKindsLabel}: {asset.dossier.missingKinds.join(", ")}
        </p>
      )}
      {asset.state === "proposed" && (
        <button
          type="button"
          onClick={() => {
            guard(() => api.startStructuring(token, asset.id));
          }}
        >
          {t.startStructuringButton}
        </button>
      )}
      {structuring && (
        <>
          <form
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
            <label htmlFor={`kind-${asset.id}`}>{t.documentKindLabel}</label>
            <select
              id={`kind-${asset.id}`}
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
            </select>
            <label htmlFor={`title-${asset.id}`}>{t.documentTitleLabel}</label>
            <input
              id={`title-${asset.id}`}
              required
              value={docTitle}
              onChange={(e) => {
                setDocTitle(e.target.value);
              }}
            />
            <button type="submit">{t.attachDocumentButton}</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              guard(() =>
                api.recordCustody(token, asset.id, { custodianName: custodian, location }),
              );
            }}
          >
            <label htmlFor={`custodian-${asset.id}`}>{t.custodianLabel}</label>
            <input
              id={`custodian-${asset.id}`}
              required
              value={custodian}
              onChange={(e) => {
                setCustodian(e.target.value);
              }}
            />
            <label htmlFor={`location-${asset.id}`}>{t.custodyLocationLabel}</label>
            <input
              id={`location-${asset.id}`}
              required
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
              }}
            />
            <button type="submit">{t.recordCustodyButton}</button>
          </form>
          {asset.checklist.unconfirmed.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                guard(() => api.confirmChecklistItem(token, asset.id, item));
              }}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              guard(() => api.approveAsset(token, asset.id));
            }}
          >
            {t.approveAssetButton}
          </button>
        </>
      )}
    </li>
  );
};
