"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, ScreeningDto } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 4.2: what a sanctions/PEP check said, and what produced it.
//
// The disclaimer is rendered with the OUTCOME, not tucked in a footnote or a
// tooltip. The platform's standing invariant is that fake compliance is always
// labeled as such, and this card is where a person finally reads one: an
// officer who sees "clear" must see, in the same breath, that nothing was
// actually checked. Everything upstream carried that label in data so that it
// could arrive here intact.
export const ScreeningCard = ({
  locale,
  investorId,
  token,
  api,
}: {
  locale: Locale;
  investorId: string;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<ScreeningDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRows(await api.investorScreenings(token, investorId));
  }, [api, token, investorId]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setError(messageOf(cause));
    });
  }, [refresh]);

  const run = () => {
    setError(undefined);
    void (async () => {
      try {
        await api.screenInvestor(token, investorId);
        await refresh();
      } catch (cause: unknown) {
        // The platform's words — "has not declared a name yet" — rather than a
        // shrug that leaves the officer guessing what to do next.
        setError(messageOf(cause));
      }
    })();
  };

  return (
    <Card
      title={t.screeningTitle}
      actions={
        <Button type="button" size="sm" variant="ghost" onClick={run}>
          {t.screeningRunButton}
        </Button>
      }
    >
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {rows === undefined ? (
        <Skeleton lines={2} testId="screenings-loading" />
      ) : rows.length === 0 ? (
        <EmptyState icon="⛨">
          <span data-testid="no-screenings">{t.screeningNone}</span>
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((row, index) => (
            <div
              key={`${row.checkedAt}-${String(index)}`}
              data-testid={`screening-${String(index)}`}
            >
              <div className="row">
                <Badge tone={row.outcome === "clear" ? "success" : "warning"}>{row.outcome}</Badge>
                <span className="text-sm muted">{row.provider}</span>
                <span className="text-sm muted">
                  {t.screeningCheckedLabel} {formatDateTime(row.checkedAt)}
                </span>
              </div>
              {row.disclaimer !== undefined && (
                <p className="field__error" data-testid={`screening-disclaimer-${String(index)}`}>
                  {row.disclaimer}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
