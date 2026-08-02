"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApiClient,
  FundingOpenedDto,
  FundingRequestDto,
  FundingStatusDto,
  LedgerDto,
} from "../../lib/api";
import { formatDate, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, Skeleton, Stat } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// The API returns this literal when a deployment has not supplied its bank
// details. Sending someone to transfer money to it would be worse than saying
// the platform is not ready.
const NOT_CONFIGURED = "NOT CONFIGURED";

const statusTone = (status: FundingStatusDto): "success" | "danger" | "warning" | "neutral" =>
  status === "confirmed"
    ? "success"
    : status === "rejected"
      ? "danger"
      : status === "pending"
        ? "warning"
        : "neutral";

// 2.4c / OD-6: the holder's money-in screen. Nothing here moves money — the
// investor makes a bank transfer quoting the reference, and treasury credits
// the ledger once they see it arrive. The copy says so at every step, because
// a screen that looks like a completed payment would be a lie.
export const FundingCard = ({
  locale,
  api,
  csrfToken,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [ledger, setLedger] = useState<LedgerDto | undefined>(undefined);
  const [history, setHistory] = useState<FundingRequestDto[] | undefined>(undefined);
  const [opened, setOpened] = useState<FundingOpenedDto | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [balance, mine] = await Promise.all([api.ledgerMe(token), api.myFunding()]);
      setLedger(balance);
      setHistory(mine);
      setLoadError(undefined);
    } catch (error) {
      // A balance that could not be read must never render as zero — that
      // would tell the holder their money is gone.
      setLoadError(messageOf(error));
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const declare = async () => {
    setBusy(true);
    try {
      setOpened(await api.requestFunding(csrfToken, amount.trim()));
      setActionError(undefined);
      await load();
    } catch (error) {
      // The typed amount is deliberately kept: making someone retype it after
      // a validation error is how people give up.
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    try {
      await api.cancelFunding(csrfToken, id);
      setActionError(undefined);
      await load();
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  if (loadError !== undefined) {
    return (
      <Card title={t.fundingTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!ledger || !history) {
    return (
      <Card title={t.fundingTitle}>
        <Skeleton lines={3} testId="funding-loading" />
      </Card>
    );
  }

  const unconfigured = opened?.instructions.accountNumber === NOT_CONFIGURED;

  return (
    <div className="stack">
      <Card title={t.fundingTitle} subtitle={t.fundingSubtitle}>
        <div className="stack">
          <div className="stat-row">
            <Stat
              label={t.fundingAvailableLabel}
              value={formatRial(ledger.balanceRial)}
              hint={t.fundingAvailableHint}
            />
            <Stat
              label={t.fundingHeldLabel}
              value={formatRial(ledger.heldRial)}
              hint={t.fundingHeldHint}
            />
          </div>

          <Field
            id="funding-amount"
            label={t.fundingAmountLabel}
            inputMode="numeric"
            value={amount}
            hint={t.fundingAmountHint}
            disabled={busy}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <div className="row">
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                void declare();
              }}
            >
              {t.fundingRequestButton}
            </Button>
          </div>

          {actionError !== undefined && (
            <p className="field__error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </Card>

      {opened && (
        <Card title={t.fundingInstructionsTitle}>
          <div className="stack">
            {unconfigured ? (
              <p className="field__error" role="alert">
                {t.fundingNotConfigured}
              </p>
            ) : (
              <>
                <p className="callout callout--warning" role="status">
                  {t.fundingNotCreditedYet}
                </p>
                <dl className="terms">
                  <div>
                    <dt>{t.fundingReferenceLabel}</dt>
                    <dd>
                      <strong className="num">{opened.request.reference}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t.fundingBankLabel}</dt>
                    <dd>{opened.instructions.bankName}</dd>
                  </div>
                  <div>
                    <dt>{t.fundingAccountHolderLabel}</dt>
                    <dd>{opened.instructions.accountHolder}</dd>
                  </div>
                  <div>
                    <dt>{t.fundingAccountNumberLabel}</dt>
                    <dd className="num">{opened.instructions.accountNumber}</dd>
                  </div>
                  <div>
                    <dt>{t.fundingAmountLabel}</dt>
                    <dd className="num">{formatRial(opened.request.amountRial)}</dd>
                  </div>
                </dl>
                <p className="muted">{opened.instructions.notice}</p>
              </>
            )}
          </div>
        </Card>
      )}

      <Card title={t.fundingHistoryTitle}>
        {history.length === 0 ? (
          <EmptyState icon="₪">{t.fundingNoHistory}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.fundingRequestedLabel}</th>
                  <th>{t.fundingReferenceLabel}</th>
                  <th className="table__num">{t.fundingDeclaredLabel}</th>
                  <th className="table__num">{t.fundingReceivedLabel}</th>
                  <th>{t.fundingStatusLabel}</th>
                  <th className="table__num">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} data-testid={`funding-${item.id}`}>
                    <td>{formatDate(item.requestedAt)}</td>
                    <td className="num">{item.reference}</td>
                    <td className="table__num num">{formatRial(item.amountRial)}</td>
                    <td className="table__num num">
                      {item.settledAmountRial !== undefined
                        ? formatRial(item.settledAmountRial)
                        : "—"}
                    </td>
                    <td>
                      <Badge tone={statusTone(item.status)}>{t.fundingStatus[item.status]}</Badge>
                      {item.rejectionReason !== undefined && (
                        <p className="muted">{item.rejectionReason}</p>
                      )}
                    </td>
                    <td className="table__num">
                      {item.status === "pending" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            void cancel(item.id);
                          }}
                        >
                          {t.fundingCancelButton}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
