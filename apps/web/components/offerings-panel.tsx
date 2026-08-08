"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, LedgerDto, OfferingViewDto } from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address, Progress } from "./ui/address";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field, Stat } from "./ui/primitives";
import { offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

export interface OfferingsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
}

// Shown wherever a figure is not known yet — distinct from a figure that is
// genuinely zero.
const UNKNOWN = "—";

// A token count is only meaningful as a whole positive number; anything else
// is a typo, not an order.
const parseTokens = (raw: string): bigint | undefined => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed) || BigInt(trimmed) === 0n) return undefined;
  return BigInt(trimmed);
};

// FR-PT-1 subset: an investor sees their settlement balance, the open
// offerings, and their own subscription/allocation — never other holders'.
export const OfferingsPanel = ({ locale, api, token }: OfferingsPanelProps) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [ledger, setLedger] = useState<LedgerDto | undefined>(undefined);
  const [offerings, setOfferings] = useState<OfferingViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [subscribeFor, setSubscribeFor] = useState<OfferingViewDto | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [balance, list] = await Promise.all([api.ledgerMe(token), api.listOfferings(token)]);
    setLedger(balance);
    setOfferings(list);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  return (
    <div className="stack">
      <div className="grid grid--2">
        {/* A balance that could not be read is shown as unknown, never as zero:
            "0 ﷼" would tell a holder their money is gone. */}
        <Stat
          label={t.availableLabel}
          value={ledger ? formatRial(ledger.balanceRial) : UNKNOWN}
          hint={`${t.heldLabel}: ${ledger ? formatRial(ledger.heldRial) : UNKNOWN}`}
        />
      </div>

      <Card title={t.offeringsTitle}>
        {offerings.length === 0 ? (
          <EmptyState icon="◇">{t.noOfferings}</EmptyState>
        ) : (
          <div className="stack">
            {offerings.map((offering) => {
              const status = offeringStatus(offering.state);
              return (
                <div
                  key={offering.id}
                  data-testid={`offering-${offering.id}`}
                  className="row row--between"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: "var(--space-4)",
                  }}
                >
                  <div className="stack" style={{ gap: "var(--space-2)" }}>
                    <div className="row">
                      <strong>{offering.assetName}</strong>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <div className="row text-sm muted">
                      <span>
                        {t.priceLabel}: {formatRial(offering.priceRial)} / token
                      </span>
                      <Address value={offering.tokenAddress} />
                    </div>
                    {offering.mySubscribed !== undefined && offering.mySubscribed !== "0" && (
                      <span className="text-sm">
                        {t.mySubscriptionLabel}: {formatTokens(offering.mySubscribed)}
                      </span>
                    )}
                    {offering.myAllocation && (
                      <span className="text-sm">
                        {t.myAllocationLabel}: {formatTokens(offering.myAllocation.allocated)} ·
                        refund {formatRial(offering.myAllocation.refundRial)}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    <Progress
                      value={Number(offering.totalSubscribed)}
                      max={Number(offering.supply)}
                      label={`${formatTokens(offering.totalSubscribed)} / ${formatTokens(offering.supply)}`}
                    />
                    {offering.state === "open" && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSubscribeFor(offering);
                        }}
                      >
                        {t.subscribeButton}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </Card>

      <SubscribeModal
        offering={subscribeFor}
        locale={locale}
        {...(ledger !== undefined ? { ledger } : {})}
        onClose={() => {
          setSubscribeFor(undefined);
        }}
        onConfirm={async (tokens) => {
          try {
            await api.subscribeOffering(token, subscribeFor?.id ?? "", tokens);
            setSubscribeFor(undefined);
            toast.show(t.subscribeSuccess, "success");
            await refresh();
            return undefined;
          } catch (e) {
            return e instanceof ApiError ? e.message : t.authFailed;
          }
        }}
      />
    </div>
  );
};

// 2.4e / OD-6: the checkout step. Subscribing spends real money, so this
// answers "what will this cost me, and can I afford it?" while the holder is
// still typing — and when they cannot afford it, it names the gap and offers
// the way to close it instead of letting the server refuse after the fact.
const SubscribeModal = ({
  offering,
  locale,
  ledger,
  onClose,
  onConfirm,
}: {
  offering: OfferingViewDto | undefined;
  locale: Locale;
  ledger?: LedgerDto;
  onClose: () => void;
  onConfirm: (tokens: string) => Promise<string | undefined>;
}) => {
  const t = dictionaries[locale];
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const ordered = parseTokens(tokens);
  const cost = offering && ordered !== undefined ? ordered * BigInt(offering.priceRial) : undefined;
  const balance = ledger !== undefined ? BigInt(ledger.balanceRial) : undefined;
  const shortfall =
    cost !== undefined && balance !== undefined && cost > balance ? cost - balance : undefined;
  const remaining =
    cost !== undefined && balance !== undefined && cost <= balance ? balance - cost : undefined;

  // Everything that can be refused without a round trip is refused here: a
  // rejected order is a wasted hold attempt on a real ledger.
  const refusal = (): string | undefined => {
    if (!offering) return t.checkoutTokensInvalid;
    if (ordered === undefined) return t.checkoutTokensInvalid;
    if (ordered < BigInt(offering.minPerInvestor) || ordered > BigInt(offering.maxPerInvestor)) {
      return `${t.checkoutOutsideLimits} ${formatTokens(offering.minPerInvestor)}–${formatTokens(
        offering.maxPerInvestor,
      )}`;
    }
    if (balance === undefined) return t.checkoutBalanceUnknown;
    if (shortfall !== undefined) return `${t.checkoutShortBy} ${formatRial(shortfall.toString())}`;
    return undefined;
  };

  const submit = () => {
    const refused = refusal();
    if (refused !== undefined) {
      setError(refused);
      return;
    }
    setBusy(true);
    setError(undefined);
    void onConfirm(tokens.trim()).then((err) => {
      setBusy(false);
      if (err) setError(err);
      else setTokens("");
    });
  };

  return (
    <Modal
      open={offering !== undefined}
      title={offering ? `${t.subscribeButton} — ${offering.assetName}` : t.subscribeButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t.cancelButton}
          </Button>
          <Button type="button" loading={busy} onClick={submit}>
            {t.confirmSubscribe}
          </Button>
        </>
      }
    >
      <div className="stack">
        {offering && (
          <p className="text-sm muted">
            {t.priceLabel}: {formatRial(offering.priceRial)} / token · {t.checkoutLimitsLabel}:{" "}
            {formatTokens(offering.minPerInvestor)}–{formatTokens(offering.maxPerInvestor)} tokens
          </p>
        )}
        <Field
          id="subscribe-tokens"
          label={t.subscribeTokensLabel}
          type="number"
          min={1}
          value={tokens}
          onChange={(e) => {
            setTokens(e.target.value);
          }}
        />

        <dl className="terms">
          <div>
            <dt>{t.checkoutCostLabel}</dt>
            <dd className="num" data-testid="checkout-cost">
              <strong>{cost !== undefined ? formatRial(cost.toString()) : UNKNOWN}</strong>
            </dd>
          </div>
          <div>
            <dt>{t.availableLabel}</dt>
            <dd className="num">{ledger ? formatRial(ledger.balanceRial) : UNKNOWN}</dd>
          </div>
          <div>
            <dt>{t.checkoutRemainingLabel}</dt>
            <dd className="num" data-testid="checkout-remaining">
              {remaining !== undefined ? formatRial(remaining.toString()) : UNKNOWN}
            </dd>
          </div>
        </dl>

        {shortfall !== undefined && (
          <p className="callout callout--warning" role="status">
            {t.checkoutShortBy} {formatRial(shortfall.toString())}.{" "}
            <a href={`/${locale}/funds`}>{t.checkoutAddFunds}</a>
          </p>
        )}

        <p className="muted text-sm">{t.checkoutHoldNotice}</p>

        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
