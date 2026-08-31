"use client";

import { useEffect, useState } from "react";
import type { AllocationAwaitingMintDto, ApiClient } from "../../lib/api";
import { formatDateTime, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// P0-2 step 3 residue (K-34). Money is captured only once an allocation's
// tokens exist, so a mint that never lands leaves the investor's Rial HELD.
// The health probe carries the count; this screen says whose money, how much,
// and why it is stuck.
//
// The release lever now exists, and this is where it is pulled — but only ever
// by hand, one allocation at a time. There is no timer: "how long before an
// investor's money goes back" is still unanswered, and this screen does not
// pretend otherwise.
//
// It refuses to offer the action in two cases, both mirroring the server:
// to a viewer without the permission to move money (a button that always 403s
// teaches an operator the screen is unreliable), and for an UNRESOLVED mint,
// where nobody knows whether the tokens exist.
export const EscrowAwaitingMintPanel = ({
  locale,
  token,
  api,
  canRelease,
}: {
  locale: Locale;
  token: string;
  api: ApiClient;
  // Whether the VIEWER may move money (LEDGER_CREDIT). The server decides for
  // real; this only governs whether the control is offered at all.
  canRelease: boolean;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<AllocationAwaitingMintDto[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});

  const load = async (): Promise<void> => {
    setRows(await api.allocationsAwaitingMint(token));
  };

  const submitRelease = async (row: AllocationAwaitingMintDto, index: number): Promise<void> => {
    const key = `${row.offeringId}:${row.investorId}`;
    const reason = (reasons[key] ?? "").trim();
    if (reason === "") {
      // Refused here as well as on the server: an operator should learn the
      // rule from the screen, not from a rejected request.
      setError(t.escrowReleaseReasonRequired);
      return;
    }
    try {
      await api.releaseStrandedEscrow(token, row.offeringId, row.investorId, reason);
      setDone((current) => ({ ...current, [String(index)]: true }));
      setError(undefined);
      await load();
    } catch (cause: unknown) {
      setError(messageOf(cause));
    }
  };

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
                  {/* An unresolved mint may already be on the chain, so the
                      money cannot be returned until someone reconciles it.
                      Saying so beats hiding the control with no explanation. */}
                  {row.mintState === "unresolved" && (
                    <span className="text-sm muted">{t.escrowReleaseUnresolvedNote}</span>
                  )}
                  {canRelease && row.mintState === "not_minted" && (
                    <div className="stack stack--tight">
                      {done[String(index)] === true ? (
                        <span className="text-sm">{t.escrowReleaseDone}</span>
                      ) : (
                        <>
                          <Field
                            label={t.escrowReleaseReasonLabel}
                            value={reasons[`${row.offeringId}:${row.investorId}`] ?? ""}
                            onChange={(event) => {
                              const { value } = event.target;
                              setReasons((current) => ({
                                ...current,
                                [`${row.offeringId}:${row.investorId}`]: value,
                              }));
                            }}
                            data-testid={`release-reason-${String(index)}`}
                          />
                          <Button
                            type="button"
                            data-testid={`release-escrow-${String(index)}`}
                            onClick={() => {
                              void submitRelease(row, index);
                            }}
                          >
                            {t.escrowReleaseAction}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
