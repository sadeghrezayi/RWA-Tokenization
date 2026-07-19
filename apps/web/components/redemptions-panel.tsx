"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, RedemptionDto } from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field } from "./ui/primitives";
import { useToast } from "./ui/toast";

// FR-TR-2 (FR-PT-3 subset): the operator's redemption queue — fulfill (burn +
// payout at attested value) or reject with a reason.
export const RedemptionsPanel = ({
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
  const [redemptions, setRedemptions] = useState<RedemptionDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [rejectFor, setRejectFor] = useState<RedemptionDto | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRedemptions(await api.listRedemptions(token));
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

  const badge = (state: RedemptionDto["state"]) =>
    state === "fulfilled"
      ? ({ tone: "success", label: "Fulfilled" } as const)
      : state === "rejected"
        ? ({ tone: "danger", label: "Rejected" } as const)
        : ({ tone: "warning", label: "Requested" } as const);

  return (
    <Card title={t.redemptionsTitle}>
      {redemptions.length === 0 ? (
        <EmptyState icon="✓">{t.noRedemptions}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.investorIdLabel}</th>
                <th>{t.statusLabel}</th>
                <th className="table__num">{t.tokensLabel}</th>
                <th className="table__num">{t.payoutLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((redemption) => {
                const b = badge(redemption.state);
                return (
                  <tr key={redemption.id} data-testid={`queue-${redemption.id}`}>
                    <td className="mono text-sm">{redemption.investorId.slice(0, 8)}…</td>
                    <td>
                      <Badge tone={b.tone}>{b.label}</Badge>
                    </td>
                    <td className="table__num num">{formatTokens(redemption.tokens)}</td>
                    <td className="table__num num">
                      {redemption.payoutRial !== undefined
                        ? formatRial(redemption.payoutRial)
                        : "—"}
                    </td>
                    <td className="table__num">
                      {redemption.state === "requested" && (
                        <div className="table__actions">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              guard(async () => {
                                await api.fulfillRedemption(token, redemption.id);
                              }, t.redemptionFulfilled);
                            }}
                          >
                            {t.fulfillButton}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setRejectFor(redemption);
                            }}
                          >
                            {t.rejectButton}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <RejectRedemptionModal
        redemption={rejectFor}
        locale={locale}
        onClose={() => {
          setRejectFor(undefined);
        }}
        onConfirm={(reason) => {
          const target = rejectFor;
          setRejectFor(undefined);
          if (target) {
            guard(() => api.rejectRedemption(token, target.id, reason), t.redemptionRejected);
          }
        }}
      />
    </Card>
  );
};

const RejectRedemptionModal = ({
  redemption,
  locale,
  onClose,
  onConfirm,
}: {
  redemption: RedemptionDto | undefined;
  locale: Locale;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const t = dictionaries[locale];
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={redemption !== undefined}
      title={t.rejectButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={() => {
              if (reason.trim() !== "") {
                onConfirm(reason.trim());
                setReason("");
              }
            }}
          >
            {t.rejectButton}
          </Button>
        </>
      }
    >
      <Field
        id="reject-redemption-reason"
        label={t.rejectReasonPrompt}
        required
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
    </Modal>
  );
};
