"use client";

import { useEffect, useState } from "react";
import type { ApiClient, IssuerHoldersDto } from "../../lib/api";
import { formatDateTime, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Basis points are how the registry carries a share, because a percentage with
// two decimals loses precision on a large supply. People read percentages.
const asPercent = (shareBps: number): string => `${(shareBps / 100).toFixed(1)}%`;

// A reference is 16 hex characters — enough to be unique, too long to read.
// Shortened for the eye; the full value is never needed by a person, only by
// the issuer comparing one reading to the next.
const shortReference = (reference: string): string => reference.slice(0, 8);

// P1-2 / FR-PT-2: the issuer's own cap table.
//
// What this screen deliberately cannot do is as much the point as what it does.
// The endpoint sends no identity and no contact detail, so there is nothing
// here to leak — and nothing here invents one. No "contact holder" button, no
// mailto: an affordance implying the platform will put an issuer in touch with
// a holder would be a promise it does not keep.
//
// The intro says WHY there are no names. An issuer who does not know that will
// ask support for them, and answering it on the screen costs less than
// answering it twice.
export const IssuerHolders = ({
  locale,
  organisationId,
  assetId,
  token,
  api,
}: {
  locale: Locale;
  organisationId: string;
  assetId: string;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [view, setView] = useState<IssuerHoldersDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        setView(await api.issuerAssetHolders(token, organisationId, assetId));
      } catch (cause: unknown) {
        // Left undefined deliberately: "nobody holds this" and "we could not
        // load it" must never render the same way.
        setError(messageOf(cause));
      }
    })();
  }, [api, token, organisationId, assetId]);

  return (
    <Card
      title={
        view === undefined ? t.issuerHoldersTitle : `${t.issuerHoldersTitle} — ${view.assetName}`
      }
    >
      <p className="text-sm muted">{t.issuerHoldersIntro}</p>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {view === undefined ? (
        error === undefined ? (
          <Skeleton />
        ) : null
      ) : view.holders.length === 0 ? (
        <div data-testid="issuer-holders-empty">
          <EmptyState>{t.issuerHoldersNoneLabel}</EmptyState>
        </div>
      ) : (
        <div className="stack">
          {view.holders.map((holder, index) => (
            <div
              className="row row--between"
              key={holder.holderReference}
              data-testid={`issuer-holder-${String(index)}`}
            >
              <div className="stack stack--tight">
                <strong className="num">{shortReference(holder.holderReference)}</strong>
                <span className="text-sm muted">
                  {t.issuerHolderSinceLabel}: {formatDateTime(holder.holderSince)}
                </span>
              </div>
              <div className="stack stack--tight">
                <span className="num">
                  {formatTokens(holder.tokens)} · {asPercent(holder.shareBps)}
                </span>
                {/* Rendered only when the platform actually holds an
                    allocation. A zero here would claim they invested nothing,
                    which is a different statement from not knowing. */}
                {holder.amountInvestedRial !== undefined && (
                  <span className="text-sm muted num">
                    {t.issuerHolderInvestedLabel}: {formatRial(holder.amountInvestedRial)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
