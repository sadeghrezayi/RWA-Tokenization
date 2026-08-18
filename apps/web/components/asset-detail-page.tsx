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
  const [propertyForm, setPropertyForm] = useState({
    addressLine: "",
    city: "",
    propertyType: "residential",
    areaSquareMetres: "",
    titleReference: "",
    builtInYear: "",
  });
  const [rightForm, setRightForm] = useState({ kind: "income", note: "" });
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
          {/* 3.3: who brought this asset. Absent means the platform did — a
              real answer, so there is no empty row for it. */}
          {asset.organisationName !== undefined && (
            <span className="text-sm muted">
              {t.assetBroughtByLabel} {asset.organisationName}
            </span>
          )}
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

      {/* The dossier is full width: it gained a per-document disclosure control,
          and at half width the actions column was pushed out of sight. */}
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
                    <th className="table__num">{t.actionsLabel}</th>
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
                      <td className="table__num">
                        {/* 2.5d: what a holder may read is a decision, so the
                              current answer is stated in words next to the
                              control that changes it. */}
                        <div className="table__actions">
                          <Badge tone={doc.investorVisible ? "success" : "neutral"}>
                            {doc.investorVisible
                              ? t.documentVisibleToHolders
                              : t.documentHiddenFromHolders}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              guard(async () => {
                                await api.setDocumentVisibility(
                                  token,
                                  asset.id,
                                  doc.kind,
                                  !doc.investorVisible,
                                );
                              }, t.disclosureUpdated);
                            }}
                          >
                            {doc.investorVisible ? t.hideFromHoldersButton : t.showToHoldersButton}
                          </Button>
                        </div>
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

      {/* 3.1: the property this token is issued against, and what it conveys —
          the platform's central claim, stated where an officer records it. */}
      <div className="grid-2">
        <Card title={t.propertyTitle} subtitle={t.propertySubtitle}>
          <div className="stack">
            {asset.realEstate ? (
              <dl className="terms">
                <div>
                  <dt>{t.addressLabel}</dt>
                  <dd>{asset.realEstate.addressLine}</dd>
                </div>
                <div>
                  <dt>{t.cityLabel}</dt>
                  <dd>{asset.realEstate.city}</dd>
                </div>
                <div>
                  <dt>{t.propertyTypeLabel}</dt>
                  <dd>{asset.realEstate.propertyType}</dd>
                </div>
                <div>
                  <dt>{t.areaLabel}</dt>
                  <dd className="num">{asset.realEstate.areaSquareMetres}</dd>
                </div>
                <div>
                  <dt>{t.titleReferenceLabel}</dt>
                  <dd className="num">{asset.realEstate.titleReference}</dd>
                </div>
                {asset.realEstate.builtInYear !== undefined && (
                  <div>
                    <dt>{t.builtInYearLabel}</dt>
                    <dd className="num">{asset.realEstate.builtInYear}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <EmptyState icon="▤">{t.noPropertyRecorded}</EmptyState>
            )}

            {/* Frozen after approval, so the form goes away rather than
                offering a button the API will refuse. */}
            {structuring && (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const area = Number(propertyForm.areaSquareMetres);
                  const year = propertyForm.builtInYear.trim();
                  guard(
                    () =>
                      api.recordRealEstateProfile(token, asset.id, {
                        addressLine: propertyForm.addressLine,
                        city: propertyForm.city,
                        propertyType: propertyForm.propertyType,
                        areaSquareMetres: Number.isFinite(area) ? area : 0,
                        titleReference: propertyForm.titleReference,
                        ...(year !== "" ? { builtInYear: Number(year) } : {}),
                      }),
                    t.propertyRecorded,
                  );
                }}
              >
                <Field
                  id="property-address"
                  label={t.addressLabel}
                  value={propertyForm.addressLine}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, addressLine: e.target.value });
                  }}
                />
                <Field
                  id="property-city"
                  label={t.cityLabel}
                  value={propertyForm.city}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, city: e.target.value });
                  }}
                />
                <SelectField
                  id="property-type"
                  label={t.propertyTypeLabel}
                  value={propertyForm.propertyType}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, propertyType: e.target.value });
                  }}
                >
                  {["residential", "commercial", "industrial", "land"].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </SelectField>
                <Field
                  id="property-area"
                  label={t.areaLabel}
                  inputMode="numeric"
                  value={propertyForm.areaSquareMetres}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, areaSquareMetres: e.target.value });
                  }}
                />
                <Field
                  id="property-title"
                  label={t.titleReferenceLabel}
                  value={propertyForm.titleReference}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, titleReference: e.target.value });
                  }}
                />
                <Field
                  id="property-year"
                  label={t.builtInYearLabel}
                  inputMode="numeric"
                  value={propertyForm.builtInYear}
                  onChange={(e) => {
                    setPropertyForm({ ...propertyForm, builtInYear: e.target.value });
                  }}
                />
                <div className="row">
                  <Button type="submit" size="sm">
                    {t.recordPropertyButton}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>

        <Card title={t.rightsTitle} subtitle={t.rightsSubtitle}>
          <div className="stack">
            {asset.rights.length === 0 ? (
              // Not "conveys nothing" — nobody has established it yet.
              <EmptyState icon="◇">{t.rightsNotEstablished}</EmptyState>
            ) : (
              <ul className="list">
                {asset.rights.map((right) => (
                  <li key={right.kind} className="list__row" data-testid={`right-${right.kind}`}>
                    <span>
                      <strong>{right.kind}</strong>
                      <span className="muted"> — {right.note}</span>
                    </span>
                    {structuring && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          guard(
                            () => api.withdrawRight(token, asset.id, right.kind),
                            t.rightWithdrawn,
                          );
                        }}
                      >
                        {t.withdrawRightButton}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {structuring && (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  guard(
                    () => api.conveyRight(token, asset.id, rightForm.kind, rightForm.note),
                    t.rightConveyed,
                  );
                }}
              >
                <SelectField
                  id="right-kind"
                  label={t.rightKindLabel}
                  value={rightForm.kind}
                  onChange={(e) => {
                    setRightForm({ ...rightForm, kind: e.target.value });
                  }}
                >
                  {["income", "disposal_proceeds", "voting", "use", "residual_value"].map(
                    (kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ),
                  )}
                </SelectField>
                <Field
                  id="right-note"
                  label={t.rightNoteLabel}
                  value={rightForm.note}
                  onChange={(e) => {
                    setRightForm({ ...rightForm, note: e.target.value });
                  }}
                />
                <div className="row">
                  <Button type="submit" size="sm">
                    {t.conveyRightButton}
                  </Button>
                </div>
              </form>
            )}
            <p className="muted text-sm">{t.rightsProvisionalNotice}</p>
          </div>
        </Card>
      </div>

      <div className="grid-2">
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
