"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field } from "./ui/primitives";
import { kycStatus } from "./ui/status";

// FR-ID-4: the compliance officer's KYC review queue.
export const OfficerPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [pending, setPending] = useState<InvestorViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [rejectFor, setRejectFor] = useState<InvestorViewDto | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setPending(await api.pendingKyc(token));
      setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    }
  }, [api, token, t.authFailed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const review = (investor: InvestorViewDto, decide: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        if (investor.kycState === "submitted") {
          await api.startReview(token, investor.id);
        }
        await decide();
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <Card title={t.pendingKycTitle}>
      {pending.length === 0 ? (
        <EmptyState icon="✓">{t.emptyQueue}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.emailLabel}</th>
                <th>{t.kycStatusTitle}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((investor) => {
                const status = kycStatus(investor.kycState);
                return (
                  <tr key={investor.id}>
                    <td>{investor.email}</td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td>
                      <div className="table__actions">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            review(investor, () => api.approve(token, investor.id));
                          }}
                        >
                          {t.approveButton}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setRejectFor(investor);
                          }}
                        >
                          {t.rejectButton}
                        </Button>
                      </div>
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
      <RejectModal
        investor={rejectFor}
        locale={locale}
        onClose={() => {
          setRejectFor(undefined);
        }}
        onConfirm={(reason) => {
          const target = rejectFor;
          setRejectFor(undefined);
          if (target) review(target, () => api.reject(token, target.id, reason));
        }}
      />
    </Card>
  );
};

const RejectModal = ({
  investor,
  locale,
  onClose,
  onConfirm,
}: {
  investor: InvestorViewDto | undefined;
  locale: Locale;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const t = dictionaries[locale];
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={investor !== undefined}
      title={investor ? `${t.rejectButton} — ${investor.email}` : t.rejectButton}
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
            {t.confirmReject}
          </Button>
        </>
      }
    >
      <Field
        id="reject-reason"
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
