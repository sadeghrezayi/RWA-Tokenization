"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, PendingFundingDto } from "../../lib/api";
import { formatDate, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Modal } from "../ui/modal";
import { Button, Card, EmptyState, Field, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isPositiveInteger = (value: string): boolean =>
  /^\d+$/.test(value.trim()) && value.trim() !== "0";

// 2.4d / OD-6: treasury's queue. An officer reads this beside a bank statement
// and answers one question per row — did this money arrive, and how much?
//
// Confirming here credits the ledger through the same maker-checker path as a
// direct credit, so above the threshold the money is NOT in the investor's
// account until a second person approves. The card says so rather than
// implying the deposit is done.
export const FundingQueueCard = ({
  locale,
  api,
  csrfToken,
}: {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
}) => {
  const t = dictionaries[locale];
  const [queue, setQueue] = useState<PendingFundingDto[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [parked, setParked] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState<PendingFundingDto | undefined>(undefined);
  const [rejecting, setRejecting] = useState<PendingFundingDto | undefined>(undefined);
  const [received, setReceived] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setQueue(await api.pendingFunding());
      setLoadError(undefined);
    } catch (error) {
      // "Could not read the queue" must never look like "nothing is waiting" —
      // that would leave real deposits unactioned.
      setLoadError(messageOf(error));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const startConfirm = (request: PendingFundingDto) => {
    setActionError(undefined);
    setParked(undefined);
    // The declared amount is a starting point, not the answer: what arrived is
    // what gets credited.
    setReceived(request.amountRial);
    setConfirming(request);
  };

  const confirm = async () => {
    if (!confirming) return;
    if (!isPositiveInteger(received)) {
      setActionError(t.fundingQueueAmountInvalid);
      return;
    }
    setBusy(true);
    try {
      const result = await api.confirmFunding(csrfToken, confirming.id, received.trim());
      setConfirming(undefined);
      setActionError(undefined);
      setParked(
        result.creditStatus.status === "pending_approval" ? t.fundingQueueParked : undefined,
      );
      await load();
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (reason.trim() === "") {
      setActionError(t.fundingQueueReasonRequired);
      return;
    }
    setBusy(true);
    try {
      await api.rejectFunding(csrfToken, rejecting.id, reason.trim());
      setRejecting(undefined);
      setReason("");
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
      <Card title={t.fundingQueueTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!queue) {
    return (
      <Card title={t.fundingQueueTitle}>
        <Skeleton lines={3} testId="funding-queue-loading" />
      </Card>
    );
  }

  const dialogOpen = confirming !== undefined || rejecting !== undefined;

  return (
    <Card title={t.fundingQueueTitle} subtitle={t.fundingQueueSubtitle}>
      <div className="stack">
        {parked !== undefined && (
          <p className="callout callout--warning" role="status">
            {parked}
          </p>
        )}

        {queue.length === 0 ? (
          <EmptyState icon="✓">{t.fundingQueueEmpty}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.fundingRequestedLabel}</th>
                  <th>{t.emailLabel}</th>
                  <th>{t.fundingReferenceLabel}</th>
                  <th className="table__num">{t.fundingDeclaredLabel}</th>
                  <th className="table__num">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id} data-testid={`pending-${item.id}`}>
                    <td>{formatDate(item.requestedAt)}</td>
                    <td>{item.investorEmail}</td>
                    <td className="num">{item.reference}</td>
                    <td className="table__num num">{formatRial(item.amountRial)}</td>
                    <td className="table__num">
                      <div className="table__actions">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            startConfirm(item);
                          }}
                        >
                          {t.fundingQueueConfirmButton}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            setActionError(undefined);
                            setRejecting(item);
                          }}
                        >
                          {t.fundingQueueRejectButton}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* One error, one place: while a dialog is open the message belongs
            next to the field it is about, not behind it as well. */}
        {actionError !== undefined && !dialogOpen && (
          <p className="field__error" role="alert">
            {actionError}
          </p>
        )}
      </div>

      <Modal
        open={confirming !== undefined}
        title={t.fundingQueueConfirmTitle}
        onClose={() => {
          setConfirming(undefined);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirming(undefined);
              }}
            >
              {t.onboardingReviewCancel}
            </Button>
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {t.fundingQueueCreditButton}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">
            {t.fundingQueueConfirmHelp} {confirming?.investorEmail} · {confirming?.reference}
          </p>
          <Field
            id="funding-received"
            label={t.fundingQueueReceivedLabel}
            inputMode="numeric"
            value={received}
            hint={t.fundingQueueReceivedHint}
            disabled={busy}
            onChange={(event) => {
              setReceived(event.target.value);
            }}
          />
          {actionError !== undefined && (
            <p className="field__error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={rejecting !== undefined}
        title={t.fundingQueueRejectTitle}
        onClose={() => {
          setRejecting(undefined);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRejecting(undefined);
              }}
            >
              {t.onboardingReviewCancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() => {
                void reject();
              }}
            >
              {t.fundingQueueSendRejectionButton}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">
            {t.fundingQueueRejectHelp} {rejecting?.investorEmail} · {rejecting?.reference}
          </p>
          <Field
            id="funding-reject-reason"
            label={t.fundingQueueReasonLabel}
            value={reason}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {actionError !== undefined && (
            <p className="field__error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </Card>
  );
};
