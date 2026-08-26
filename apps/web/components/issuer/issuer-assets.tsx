"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ApiClient, AssetViewDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, SelectField, Skeleton } from "../ui/primitives";
import { base64Of } from "../../lib/file-bytes";
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
  // Which asset the person is filing for. One at a time: a form per row would
  // put six file pickers on screen for an issuer with three assets.
  const [openAssetId, setOpenAssetId] = useState<string | undefined>(undefined);
  const [docTitle, setDocTitle] = useState("");
  const [docKind, setDocKind] = useState("");
  const [docFile, setDocFile] = useState<File | undefined>(undefined);
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

  // K-33 applies here too: a dossier entry with no document behind it is worse
  // than a missing one, because it marks the requirement satisfied. The bytes
  // stored are the file's, and without a file nothing is sent.
  const file = async (assetId: string): Promise<void> => {
    const title = docTitle.trim();
    if (title === "" || !docFile || docKind === "") {
      return;
    }
    setError(undefined);
    try {
      await api.attachIssuerAssetDocument(csrf, organisationId, assetId, {
        kind: docKind,
        title,
        contentBase64: await base64Of(docFile),
      });
      setDocTitle("");
      setDocFile(undefined);
      await refresh();
      toast.show(t.documentAttached, "success");
    } catch (cause: unknown) {
      // The platform's own words — "at most 10 MB", "not brought by your
      // organisation" — rather than a shrug.
      setError(messageOf(cause));
    }
  };

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
              <th>{t.issuerHoldersTitle}</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const status = assetStatus(asset.state);
              return (
                // A fragment because the open asset renders a SECOND row
                // beneath its own; a table cannot nest the form inside the row
                // it belongs to without breaking the column alignment.
                <Fragment key={asset.id}>
                  <tr data-testid={`issuer-asset-${asset.id}`}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          const next = openAssetId === asset.id ? undefined : asset.id;
                          setOpenAssetId(next);
                          // The first thing still missing, so the common case is
                          // one click and a file.
                          setDocKind(asset.dossier.missingKinds[0] ?? "");
                          setDocTitle("");
                          setDocFile(undefined);
                          setError(undefined);
                        }}
                      >
                        <strong>{asset.name}</strong>
                      </button>
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
                    {/* P1-2: the issuer's own cap table. A link rather than an
                      inline expansion — it is a page an issuer returns to, and
                      the row is already carrying the dossier form. */}
                    <td>
                      <Link
                        href={`/${locale}/issuer/${organisationId}/assets/${asset.id}/holders`}
                        data-testid={`issuer-asset-holders-link-${asset.id}`}
                      >
                        {t.issuerHoldersLink}
                      </Link>
                    </td>
                  </tr>
                  {openAssetId === asset.id && (
                    <tr>
                      <td colSpan={4}>
                        {asset.dossier.missingKinds.length === 0 ? (
                          <p className="text-sm muted">{t.issuerNothingMissing}</p>
                        ) : (
                          <form
                            className="row row--bottom"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void file(asset.id);
                            }}
                          >
                            <Field
                              id="issuer-doc-file"
                              label={t.documentFileLabel}
                              type="file"
                              onChange={(e) => {
                                setDocFile(e.target.files?.[0]);
                              }}
                            />
                            <SelectField
                              id="issuer-doc-kind"
                              label={t.documentKindLabel}
                              value={docKind}
                              onChange={(e) => {
                                setDocKind(e.target.value);
                              }}
                            >
                              {/* Only what is still missing: offering a kind the
                                platform already holds invites a refusal the
                                issuer could not have predicted. */}
                              {asset.dossier.missingKinds.map((kind) => (
                                <option key={kind} value={kind}>
                                  {kind}
                                </option>
                              ))}
                            </SelectField>
                            <Field
                              id="issuer-doc-title"
                              label={t.documentTitleLabel}
                              value={docTitle}
                              onChange={(e) => {
                                setDocTitle(e.target.value);
                              }}
                            />
                            <Button type="submit">{t.attachDocumentButton}</Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
