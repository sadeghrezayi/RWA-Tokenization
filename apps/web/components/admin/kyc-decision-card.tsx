"use client";

import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Button, Card } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

// 4.3 investor review workspace: the decision, where the evidence is.
//
// Until now an officer approved from a queue row showing an email and a status
// badge, while the identity file, the screening result and the risk rating sat
// on a different screen. Deciding without them in view is exactly the failure
// this platform exists to prevent.
//
// The actions mirror the domain's state machine exactly — submitted → start
// review, in_review → approve or reject. Offering anything the server would
// answer with a 409 would be a fake button.
export const KycDecisionCard = ({
  locale,
  investorId,
  token,
  kycState,
  api,
  onDecided,
}: {
  locale: Locale;
  investorId: string;
  token: string;
  kycState: KycState;
  api: ApiClient;
  onDecided: () => void;
}) => {
  const t = dictionaries[locale];
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [gaps, setGaps] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [screenings, assessments] = await Promise.all([
          api.investorScreenings(token, investorId),
          api.investorRiskAssessments(token, investorId),
        ]);
        // Advisory, never a gate: whether an unscreened or unrated applicant
        // may be approved is a compliance-policy decision nobody has made, so
        // this states the fact and leaves the judgement to the officer.
        setGaps([
          ...(screenings.length === 0 ? [t.kycGapNotScreened] : []),
          ...(assessments.length === 0 ? [t.kycGapNotRated] : []),
        ]);
      } catch {
        // A failure to read the context must not block the decision, and must
        // not claim there are no gaps either — so it says nothing.
        setGaps([]);
      }
    })();
  }, [api, token, investorId, t.kycGapNotScreened, t.kycGapNotRated]);

  const run = (action: () => Promise<void>) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        onDecided();
      } catch (cause: unknown) {
        setError(messageOf(cause));
      }
    })();
  };

  const reject = () => {
    const stated = reason.trim();
    if (stated === "") {
      setError(t.kycRejectReasonRequired);
      return;
    }
    run(() => api.reject(token, investorId, stated));
  };

  return (
    <Card title={t.kycDecisionTitle}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {kycState === "in_review" && gaps.length > 0 && (
        <p className="field__error" data-testid="kyc-evidence-gaps">
          {t.kycGapsPrefix} {gaps.join(", ")}.
        </p>
      )}

      {kycState === "submitted" && (
        <Button
          type="button"
          size="sm"
          data-testid="kyc-start-review"
          onClick={() => {
            run(() => api.startReview(token, investorId));
          }}
        >
          {t.kycStartReviewButton}
        </Button>
      )}

      {kycState === "in_review" && (
        <div className="stack">
          <Button
            type="button"
            size="sm"
            data-testid="kyc-approve"
            onClick={() => {
              run(() => api.approve(token, investorId));
            }}
          >
            {t.approveButton}
          </Button>
          <div className="row">
            <input
              className="field__input"
              aria-label={t.kycRejectReasonLabel}
              placeholder={t.kycRejectReasonLabel}
              data-testid="kyc-reject-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="danger"
              data-testid="kyc-reject"
              onClick={reject}
            >
              {t.rejectButton}
            </Button>
          </div>
        </div>
      )}

      {kycState !== "submitted" && kycState !== "in_review" && (
        <p className="muted text-sm" data-testid="kyc-no-actions">
          {t.kycNoActions}
        </p>
      )}
    </Card>
  );
};
