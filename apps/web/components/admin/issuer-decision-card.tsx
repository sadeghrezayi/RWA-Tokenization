"use client";

import { useState } from "react";
import type { ApiClient, IssuerStateDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Button, Card } from "../ui/primitives";
import {
  canDecide,
  canReinstate,
  canStartReview,
  canSuspend,
  hasAnyAction,
} from "./issuer-review-actions";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 4.3 org review workspace: the decision, where the organisation's identity and
// its team already are.
//
// The same gap as the investor side — an officer decided from a queue row while
// the things they were deciding about lived on the detail page. The legal
// actions come from one shared definition (issuer-review-actions), so this and
// the queue can never disagree about which buttons exist.
export const IssuerDecisionCard = ({
  locale,
  organisationId,
  csrfToken,
  state,
  api,
  onDecided,
}: {
  locale: Locale;
  organisationId: string;
  csrfToken: string;
  state: IssuerStateDto;
  api: ApiClient;
  onDecided: () => void;
}) => {
  const t = dictionaries[locale];
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const run = (action: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        setReason("");
        onDecided();
      } catch (cause: unknown) {
        setError(messageOf(cause));
      }
    })();
  };

  // Refusing and suspending both take something away, and the organisation is
  // told why. An empty reason is refused here rather than by a 400.
  const withReason = (action: (stated: string) => Promise<void>) => {
    const stated = reason.trim();
    if (stated === "") {
      setError(t.issuerReasonRequired);
      return;
    }
    run(() => action(stated));
  };

  return (
    <Card title={t.issuerDecisionTitle}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="stack">
        {canStartReview(state) && (
          <Button
            type="button"
            size="sm"
            data-testid="issuer-start-review"
            onClick={() => {
              run(() => api.startIssuerReview(csrfToken, organisationId));
            }}
          >
            {t.issuersStartReviewButton}
          </Button>
        )}

        {canDecide(state) && (
          <Button
            type="button"
            size="sm"
            data-testid="issuer-approve"
            onClick={() => {
              run(() => api.approveIssuer(csrfToken, organisationId));
            }}
          >
            {t.issuersApproveButton}
          </Button>
        )}

        {canReinstate(state) && (
          <Button
            type="button"
            size="sm"
            data-testid="issuer-reinstate"
            onClick={() => {
              run(() => api.reinstateIssuer(csrfToken, organisationId));
            }}
          >
            {t.issuersReinstateButton}
          </Button>
        )}

        {(canDecide(state) || canSuspend(state)) && (
          <div className="row">
            <input
              className="field__input"
              aria-label={t.issuerReasonLabel}
              placeholder={t.issuerReasonLabel}
              data-testid="issuer-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            {canDecide(state) && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                data-testid="issuer-reject"
                onClick={() => {
                  withReason((stated) => api.rejectIssuer(csrfToken, organisationId, stated));
                }}
              >
                {t.issuersRejectButton}
              </Button>
            )}
            {canSuspend(state) && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                data-testid="issuer-suspend"
                onClick={() => {
                  withReason((stated) => api.suspendIssuer(csrfToken, organisationId, stated));
                }}
              >
                {t.issuersSuspendButton}
              </Button>
            )}
          </div>
        )}

        {!hasAnyAction(state) && (
          <p className="muted text-sm" data-testid="issuer-no-actions">
            {t.issuerNoActions}
          </p>
        )}
      </div>
    </Card>
  );
};
