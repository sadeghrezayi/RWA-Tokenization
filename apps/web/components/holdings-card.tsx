"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, HoldingDto, RedemptionDto } from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field } from "./ui/primitives";
import { useToast } from "./ui/toast";

// FR-TR: the investor's on-chain holdings with the two honest liquidity paths —
// transfer to another verified investor (by email, P2) and redemption at the
// attested value (operator-reviewed).
export const HoldingsCard = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [holdings, setHoldings] = useState<HoldingDto[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [transferFor, setTransferFor] = useState<HoldingDto | undefined>(undefined);
  const [redeemFor, setRedeemFor] = useState<HoldingDto | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [h, r] = await Promise.all([api.myHoldings(token), api.myRedemptions(token)]);
    setHoldings(h);
    setRedemptions(r);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  const guard = (action: () => Promise<void>, successMsg: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        toast.show(successMsg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  const redemptionBadge = (state: RedemptionDto["state"]) =>
    state === "fulfilled"
      ? ({ tone: "success", label: "Fulfilled" } as const)
      : state === "rejected"
        ? ({ tone: "danger", label: "Rejected" } as const)
        : ({ tone: "warning", label: "Requested" } as const);

  return (
    <Card title={t.holdingsTitle}>
      {holdings.length === 0 ? (
        <EmptyState icon="◇">{t.noHoldings}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.assetLabel}</th>
                <th className="table__num">{t.tokensLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.assetId} data-testid={`holding-${holding.assetId}`}>
                  <td>
                    <strong>{holding.assetName}</strong>
                  </td>
                  <td className="table__num num">{formatTokens(holding.tokens)}</td>
                  <td className="table__num">
                    <div className="table__actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setTransferFor(holding);
                        }}
                      >
                        {t.transferButton}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRedeemFor(holding);
                        }}
                      >
                        {t.redeemButton}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {redemptions.length > 0 && (
        <div className="stack" style={{ marginTop: "var(--space-4)", gap: "var(--space-2)" }}>
          <p className="stat__label">{t.myRedemptionsTitle}</p>
          {redemptions.map((r) => {
            const badge = redemptionBadge(r.state);
            return (
              <div key={r.id} className="row text-sm" data-testid={`redemption-${r.id}`}>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <span>{formatTokens(r.tokens)} tokens</span>
                {r.payoutRial !== undefined && (
                  <span className="num">
                    {t.payoutLabel}: {formatRial(r.payoutRial)}
                  </span>
                )}
                {r.rejectionReason !== undefined && (
                  <span className="muted">{r.rejectionReason}</span>
                )}
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

      <TransferModal
        holding={transferFor}
        locale={locale}
        onClose={() => {
          setTransferFor(undefined);
        }}
        onTransfer={(assetId, toEmail, tokens) => {
          setTransferFor(undefined);
          guard(async () => {
            await api.transferTokens(token, { assetId, toEmail, tokens });
          }, t.transferSent);
        }}
      />
      <RedeemModal
        holding={redeemFor}
        locale={locale}
        onClose={() => {
          setRedeemFor(undefined);
        }}
        onRedeem={(assetId, tokens) => {
          setRedeemFor(undefined);
          guard(async () => {
            await api.requestRedemption(token, { assetId, tokens });
          }, t.redemptionRequested);
        }}
      />
    </Card>
  );
};

const TransferModal = ({
  holding,
  locale,
  onClose,
  onTransfer,
}: {
  holding: HoldingDto | undefined;
  locale: Locale;
  onClose: () => void;
  onTransfer: (assetId: string, toEmail: string, tokens: string) => void;
}) => {
  const t = dictionaries[locale];
  const [toEmail, setToEmail] = useState("");
  const [tokens, setTokens] = useState("");

  return (
    <Modal
      open={holding !== undefined}
      title={holding ? `${t.transferButton} — ${holding.assetName}` : t.transferButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (holding && toEmail.trim() !== "" && tokens.trim() !== "") {
                onTransfer(holding.assetId, toEmail.trim(), tokens.trim());
                setToEmail("");
                setTokens("");
              }
            }}
          >
            {t.transferButton}
          </Button>
        </>
      }
    >
      <Field
        id="transfer-email"
        label={t.toEmailLabel}
        type="email"
        value={toEmail}
        onChange={(e) => {
          setToEmail(e.target.value);
        }}
      />
      <Field
        id="transfer-tokens"
        label={t.tokensLabel}
        type="number"
        {...(holding ? { hint: `${formatTokens(holding.tokens)} available` } : {})}
        value={tokens}
        onChange={(e) => {
          setTokens(e.target.value);
        }}
      />
    </Modal>
  );
};

const RedeemModal = ({
  holding,
  locale,
  onClose,
  onRedeem,
}: {
  holding: HoldingDto | undefined;
  locale: Locale;
  onClose: () => void;
  onRedeem: (assetId: string, tokens: string) => void;
}) => {
  const t = dictionaries[locale];
  const [tokens, setTokens] = useState("");

  return (
    <Modal
      open={holding !== undefined}
      title={holding ? `${t.redeemButton} — ${holding.assetName}` : t.redeemButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (holding && tokens.trim() !== "") {
                onRedeem(holding.assetId, tokens.trim());
                setTokens("");
              }
            }}
          >
            {t.redeemButton}
          </Button>
        </>
      }
    >
      <Field
        id="redeem-tokens"
        label={t.tokensLabel}
        type="number"
        {...(holding ? { hint: `${formatTokens(holding.tokens)} available` } : {})}
        value={tokens}
        onChange={(e) => {
          setTokens(e.target.value);
        }}
      />
    </Modal>
  );
};
