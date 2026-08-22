"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiClient, DueReviewDto, ReviewCadenceDto } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 4.2: approved customers whose periodic review is due.
//
// A work list, not an enforcement mechanism — nothing here restricts anybody,
// and the cadence notice says so. Two things this screen must not do: re-sort
// the rows (the API puts the worst first, and a screen that re-orders by name
// buries them), and show a failed load as an empty list.
export const DueReviewsPanel = ({
  locale,
  token,
  api,
}: {
  locale: Locale;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<DueReviewDto[] | undefined>(undefined);
  const [cadence, setCadence] = useState<ReviewCadenceDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        setCadence(await api.reviewCadence(token));
        setRows(await api.dueReviews(token));
      } catch (cause: unknown) {
        // Left as undefined on purpose: "could not read this" must never
        // render as "nobody is due".
        setError(messageOf(cause));
      }
    })();
  }, [api, token]);

  return (
    <Card title={t.dueReviewsTitle}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {cadence !== undefined && (
        <p className="field__error" data-testid="review-cadence-notice">
          {cadence.notice}
        </p>
      )}
      {rows === undefined ? (
        error === undefined ? (
          <Skeleton lines={3} />
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState icon="◷">
          <span data-testid="no-due-reviews">{t.dueReviewsNone}</span>
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((row, index) => (
            <div key={row.investorId} data-testid={`due-review-${String(index)}`} className="row">
              <Badge tone={row.state === "never_reviewed" ? "danger" : "warning"}>
                {row.state === "never_reviewed"
                  ? t.dueReviewsNever
                  : `${t.dueReviewsOverdueBy} ${String(row.overdueByDays ?? 0)}d`}
              </Badge>
              <Link href={`/${locale}/admin/investors/${row.investorId}`}>{row.email}</Link>
              {row.lastReviewedAt !== undefined && (
                <span className="text-sm muted">
                  {t.dueReviewsLastReviewed} {formatDateTime(row.lastReviewedAt)}
                </span>
              )}
              {row.dueAt !== undefined && (
                <span className="text-sm muted">
                  {t.dueReviewsDueAt} {formatDateTime(row.dueAt)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
