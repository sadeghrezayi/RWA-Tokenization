"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import type { ApiClient, ApprovalViewDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Modal } from "../ui/modal";
import { Button, Card, EmptyState, Field } from "../ui/primitives";

// T1/T3 maker-checker queue: a second officer approves or rejects a parked
// sensitive action. Approving your own request is refused by the API (409).
export const ApprovalsPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [pending, setPending] = useState<ApprovalViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [rejectFor, setRejectFor] = useState<ApprovalViewDto | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setPending(await api.listApprovals(token));
      setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    }
  }, [api, token, t.authFailed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = (action: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <Card title={t.approvalsTitle} subtitle={t.approvalsSubtitle}>
      {pending.length === 0 ? (
        <EmptyState icon="✓">{t.noApprovals}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.detailsLabel}</th>
                <th>{t.requestedByLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((approval) => (
                <tr key={approval.id}>
                  <td>{approval.summary}</td>
                  {/* The colleague who asked, not their account id. */}
                  <td>{approval.makerLabel ?? approval.makerId}</td>
                  <td>
                    <div className="table__actions">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          decide(() => api.approveApproval(token, approval.id));
                        }}
                      >
                        {t.approveButton}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setRejectFor(approval);
                        }}
                      >
                        {t.rejectButton}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
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
        approval={rejectFor}
        locale={locale}
        onClose={() => {
          setRejectFor(undefined);
        }}
        onConfirm={(reason) => {
          const target = rejectFor;
          setRejectFor(undefined);
          if (target) decide(() => api.rejectApproval(token, target.id, reason));
        }}
      />
    </Card>
  );
};

const RejectModal = ({
  approval,
  locale,
  onClose,
  onConfirm,
}: {
  approval: ApprovalViewDto | undefined;
  locale: Locale;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const t = dictionaries[locale];
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={approval !== undefined}
      title={t.rejectButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t.cancelButton}
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
        id="approval-reject-reason"
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
