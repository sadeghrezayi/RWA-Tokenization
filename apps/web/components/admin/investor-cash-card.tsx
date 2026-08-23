"use client";

import { useEffect, useState } from "react";
import type { ApiClient, InvestorFundingDto } from "../../lib/api";
import { formatDateTime, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 4.3 Investor 360, Cash & payments: the money that actually moved.
//
// A balance says where someone ended up; this says how they got there — which
// is what an officer reviewing a file needs, and what they would otherwise have
// to reconstruct from the treasury queue.
//
// The SETTLED amount is shown beside the declared one whenever they differ: a
// deposit is confirmed for what actually arrived, not for what was promised,
// and hiding the gap would misstate the record.
export const InvestorCashCard = ({
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
  const [rows, setRows] = useState<InvestorFundingDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await api.investorFunding(token, investorId));
      } catch (cause: unknown) {
        setError(messageOf(cause));
      }
    })();
  }, [api, token, investorId]);

  return (
    <Card title={t.cashMovementsLabel}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {rows === undefined ? (
        error === undefined ? (
          <Skeleton lines={2} />
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState icon="⊕">
          <span data-testid="no-cash-movements">{t.cashNone}</span>
        </EmptyState>
      ) : (
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          {rows.map((row, index) => (
            <div key={row.id} className="row text-sm" data-testid={`cash-${String(index)}`}>
              <Badge tone={row.status === "settled" ? "success" : "warning"}>{row.status}</Badge>
              <span className="num">{formatRial(row.amountRial)}</span>
              {row.settledAmountRial !== undefined && row.settledAmountRial !== row.amountRial && (
                // What arrived, when it differs from what was declared.
                <span className="num muted" data-testid={`cash-settled-${String(index)}`}>
                  → {formatRial(row.settledAmountRial)}
                </span>
              )}
              <span className="muted">
                {t.cashReferenceLabel} {row.reference}
              </span>
              <span className="muted">{formatDateTime(row.requestedAt)}</span>
              {row.rejectionReason !== undefined && (
                <span className="field__error">{row.rejectionReason}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
