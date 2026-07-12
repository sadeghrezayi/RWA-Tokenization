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
        <Stat
          label={t.availableLabel}
          value={formatRial(ledger?.balanceRial ?? "0")}
          hint={`${t.heldLabel}: ${formatRial(ledger?.heldRial ?? "0")}`}
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

const SubscribeModal = ({
  offering,
  locale,
  onClose,
  onConfirm,
}: {
  offering: OfferingViewDto | undefined;
  locale: Locale;
  onClose: () => void;
  onConfirm: (tokens: string) => Promise<string | undefined>;
}) => {
  const t = dictionaries[locale];
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (tokens.trim() === "") return;
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
            Cancel
          </Button>
          <Button type="button" loading={busy} onClick={submit}>
            {t.confirmSubscribe}
          </Button>
        </>
      }
    >
      {offering && (
        <p className="text-sm muted">
          {t.priceLabel}: {formatRial(offering.priceRial)} / token · {t.availableLabel}:{" "}
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
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
};
