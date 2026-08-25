"use client";

import { useEffect, useState } from "react";
import type { AllocationAwaitingMintDto, ApiClient } from "../../lib/api";
import { formatDateTime, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// P0-2 step 3 residue (K-34). Money is captured only once an allocation's
// tokens exist, so a mint that never lands leaves the investor's Rial HELD.
// The health probe carries the count; this screen says whose money, how much,
// and why it is stuck.
//
// THERE IS DELIBERATELY NO RELEASE BUTTON. How long to wait before releasing an
// investor's escrow, and who is allowed to, are unanswered product questions. A
// screen that invited the action before the rule existed would be worse than
// one that only reports the truth.
export const EscrowAwaitingMintPanel = ({
  locale,
  token,
  api,
}: {
  locale: Locale;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<AllocationAwaitingMintDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await api.allocationsAwaitingMint(token));
      } catch (cause: unknown) {
        // Left undefined on purpose. "Nothing is stuck" and "we could not
        // check" must never look the same — reading a failed load as clean
        // books is the most dangerous thing this screen could do.
        setError(messageOf(cause));
      }
    })();
  }, [api, token]);

  // Summed here rather than left to the reader: the total is the number a
  // decision gets made on, and making a person add up rows invites error.
  const totalHeld = (rows ?? []).reduce((sum, row) => sum + BigInt(row.heldRial), 0n);

  return (
    <Card title={t.escrowAwaitingMintTitle}>
      <p className="text-sm muted">{t.escrowAwaitingMintIntro}</p>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {rows === undefined ? (
        error === undefined ? (
          <Skeleton />
        ) : null
      ) : rows.length === 0 ? (
        <div data-testid="awaiting-mint-empty">
          <EmptyState>{t.escrowAwaitingMintNoneLabel}</EmptyState>
        </div>
      ) : (
        <>
          <p className="text-sm" data-testid="awaiting-mint-total">
            {t.escrowAwaitingMintTotalLabel}: {formatRial(totalHeld)}
          </p>
          <div className="stack">
            {rows.map((row, index) => (
              <div
                className="row row--between"
                key={`${row.offeringId}:${row.investorId}`}
                data-testid={`awaiting-mint-${String(index)}`}
              >
                <div className="stack stack--tight">
                  <strong>{row.investorEmail}</strong>
                  <span className="text-sm muted">
                    {row.assetName} · {formatTokens(row.tokens)}
                  </span>
                  <span className="text-sm muted">
                    {t.escrowHeldSinceLabel}: {formatDateTime(row.since)}
                  </span>
                  {row.retry?.lastError !== undefined && (
                    <span className="text-sm muted">
                      {t.escrowLastErrorLabel}: {row.retry.lastError} ({row.retry.attempts})
                    </span>
                  )}
                </div>
                <div className="stack stack--tight">
                  <span className="num">{formatRial(row.heldRial)}</span>
                  {/* The two states need opposite handling — an unresolved mint
                      may already be on the chain — so they are never rendered
                      as the same thing. */}
                  {/* The testid lives on a wrapper: Badge is a shared
                      primitive and does not forward arbitrary props. */}
                  <span data-testid={`awaiting-mint-${String(index)}-state`}>
                    <Badge tone={row.mintState === "unresolved" ? "warning" : "danger"}>
                      {row.mintState === "unresolved"
                        ? t.escrowStateUnresolvedLabel
                        : t.escrowStateNotMintedLabel}
                    </Badge>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
