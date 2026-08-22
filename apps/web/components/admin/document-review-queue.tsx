"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ApiClient, DocumentAwaitingReviewDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const keyOf = (row: DocumentAwaitingReviewDto): string => `${row.assetId}:${row.kind}`;

// 4.3: `/ops/documents`. The only place a person decides whether the evidence
// behind a token is sound.
//
// Two things this screen must never do: imply a decision nobody made (a failed
// load is not an empty queue), and let a rejection leave without a reason — the
// issuer receives that reason and nothing else.
export const DocumentReviewQueue = ({
  locale,
  token,
  api,
}: {
  locale: Locale;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<DocumentAwaitingReviewDto[] | undefined>(undefined);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRows(await api.documentsAwaitingReview(token));
  }, [api, token]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setError(messageOf(cause));
    });
  }, [refresh]);

  const decide = (run: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await run();
        await refresh();
      } catch (cause: unknown) {
        setError(messageOf(cause));
      }
    })();
  };

  const reject = (row: DocumentAwaitingReviewDto) => {
    const reason = (reasons[keyOf(row)] ?? "").trim();
    if (reason === "") {
      // Refused here rather than by a 400, so the officer is told what is
      // missing instead of discovering it from a failed request.
      setError(t.documentReviewReasonRequired);
      return;
    }
    decide(() => api.rejectDocument(token, row.assetId, row.kind, reason));
  };

  return (
    <Card title={t.documentReviewTitle}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {rows === undefined ? (
        error === undefined ? (
          <Skeleton lines={3} />
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState icon="▤">
          <span data-testid="no-documents-awaiting">{t.documentReviewNone}</span>
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((row, index) => (
            <div key={keyOf(row)} data-testid={`doc-review-${String(index)}`} className="stack">
              <div className="row">
                <Badge tone={row.state === "rejected" ? "danger" : "warning"}>{row.kind}</Badge>
                <Link href={`/${locale}/admin/assets/${row.assetId}`}>{row.assetName}</Link>
                <span className="text-sm muted">{row.title}</span>
              </div>
              {row.reason !== undefined && (
                <p className="field__error">
                  {t.documentReviewPreviouslyRejected} {row.reason}
                </p>
              )}
              <div className="row">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    decide(() => api.acceptDocument(token, row.assetId, row.kind));
                  }}
                  data-testid={`doc-accept-${String(index)}`}
                >
                  {t.documentReviewAccept}
                </Button>
                <input
                  className="field__input"
                  aria-label={t.documentReviewReasonLabel}
                  placeholder={t.documentReviewReasonLabel}
                  data-testid={`doc-reason-${String(index)}`}
                  value={reasons[keyOf(row)] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setReasons((current) => ({ ...current, [keyOf(row)]: value }));
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    reject(row);
                  }}
                  data-testid={`doc-reject-${String(index)}`}
                >
                  {t.documentReviewReject}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
