"use client";

import { useEffect, useState } from "react";
import type { ApiClient, DistributionReconciliationDto } from "../../lib/api";
import { formatDateTime, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const TONE = { agrees: "success", disagrees: "danger", not_reconcilable: "warning" } as const;

// FR-RA-4, the auditor's own screen: was every Rial a distribution DECLARED
// actually credited to a holder?
//
// Three things this screen must never do. It must not show an untraceable
// payout as agreeing — that would tell an auditor a figure was checked when it
// was not. It must not render a missing credited figure as zero, which would
// read as "nobody was paid". And a failed load must never look like clean
// books, which is the most dangerous thing it could get wrong.
export const ReconciliationPanel = ({
  locale,
  token,
  api,
}: {
  locale: Locale;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<DistributionReconciliationDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await api.distributionReconciliation(token));
      } catch (cause: unknown) {
        // Left undefined on purpose: no summary, no empty state, nothing that
        // could be read as a verdict on the books.
        setError(messageOf(cause));
      }
    })();
  }, [api, token]);

  const exceptions = (rows ?? []).filter((row) => row.status === "disagrees").length;

  return (
    <Card title={t.reconciliationTitle}>
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
        <EmptyState icon="◫">
          <span data-testid="no-reconciliation">{t.reconciliationNone}</span>
        </EmptyState>
      ) : (
        <div className="stack">
          <p
            className={exceptions > 0 ? "field__error" : "muted text-sm"}
            data-testid="reconciliation-summary"
          >
            {exceptions > 0
              ? `${String(exceptions)} ${t.reconciliationSummaryExceptions}`
              : t.reconciliationSummaryClean}
          </p>

          {rows.map((row, index) => (
            <div
              key={row.distributionId}
              data-testid={`reconciliation-${String(index)}`}
              className="stack"
              style={{ gap: "var(--space-1)" }}
            >
              <div className="row">
                {/* The verdict is its own element so a test can assert THIS
                    rather than the row's text — the explanatory hint below
                    also contains the words "cannot be verified", which made an
                    earlier test pass even when the badge read "Agrees". */}
                <span data-testid={`reconciliation-verdict-${String(index)}`}>
                  <Badge tone={TONE[row.status]}>
                    {row.status === "agrees"
                      ? t.reconciliationAgrees
                      : row.status === "disagrees"
                        ? t.reconciliationDisagrees
                        : t.reconciliationNotChecked}
                  </Badge>
                </span>
                <span className="text-sm muted">
                  {t.reconciliationDeclared} {formatRial(row.declaredRial)}
                </span>
                {/* Only when it is actually known. An absent figure stays
                    absent rather than becoming a zero nobody can distinguish
                    from "no money reached anyone". */}
                {row.creditedRial !== undefined && (
                  <span className="text-sm muted">
                    {t.reconciliationCredited} {formatRial(row.creditedRial)}
                  </span>
                )}
                {row.differenceRial !== undefined && row.differenceRial !== "0" && (
                  <span className="text-sm">
                    {t.reconciliationDifference} {formatRial(row.differenceRial)}
                  </span>
                )}
                {row.paidAt !== undefined && (
                  <span className="text-sm muted">{formatDateTime(row.paidAt)}</span>
                )}
              </div>
              {row.status === "not_reconcilable" && (
                <p className="field__hint">{t.reconciliationNotCheckedHint}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
