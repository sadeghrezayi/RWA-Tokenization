"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, IssuerOrganisationDto, IssuerStateDto } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Dictionary, Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import type { BadgeTone } from "../ui/badge";
import { Modal } from "../ui/modal";
import { Button, Card, EmptyState, Field, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const stateLabel = (t: Dictionary, state: IssuerStateDto): string =>
  ({
    applied: t.issuersStateApplied,
    in_review: t.issuersStateInReview,
    approved: t.issuersStateApproved,
    rejected: t.issuersStateRejected,
    suspended: t.issuersStateSuspended,
  })[state];

const stateTone = (state: IssuerStateDto): BadgeTone =>
  ({
    applied: "neutral" as const,
    in_review: "info" as const,
    approved: "success" as const,
    rejected: "danger" as const,
    suspended: "warning" as const,
  })[state];

// Which decision an officer is offered, and when. Deliberately mirrors the
// domain's state machine: showing an action the server would refuse with a 409
// is a fake button, and the mandate forbids those.
const canStartReview = (state: IssuerStateDto) => state === "applied";
const canDecide = (state: IssuerStateDto) => state === "in_review";
const canSuspend = (state: IssuerStateDto) => state === "approved";
const canReinstate = (state: IssuerStateDto) => state === "suspended";

interface Pending {
  organisation: IssuerOrganisationDto;
  kind: "reject" | "suspend";
}

// 3.2f: the platform's side of issuer onboarding. An officer reads the entity's
// legal identity — the things they check against a company registry — and takes
// one decision per row. Nothing about the people acting for the organisation is
// shown here; that is the team panel, and it is a separate privilege.
export const IssuersPanel = ({
  locale,
  api,
  csrfToken,
}: {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
}) => {
  const t = dictionaries[locale];
  const [rows, setRows] = useState<IssuerOrganisationDto[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.issuers());
      setLoadError(undefined);
    } catch (error) {
      // "Could not read the queue" must never look like "nobody has applied" —
      // that would leave real applicants waiting indefinitely.
      setLoadError(messageOf(error));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setActionError(undefined);
      await load();
    } catch (error) {
      // The server's own refusal, verbatim — never a decision that looks taken.
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const openReasonDialog = (organisation: IssuerOrganisationDto, kind: Pending["kind"]) => {
    setActionError(undefined);
    setReason("");
    setPending({ organisation, kind });
  };

  const submitReason = async () => {
    if (!pending) return;
    if (reason.trim() === "") {
      setActionError(t.issuersReasonRequired);
      return;
    }
    const { organisation, kind } = pending;
    const trimmed = reason.trim();
    await run(async () => {
      await (kind === "reject"
        ? api.rejectIssuer(csrfToken, organisation.id, trimmed)
        : api.suspendIssuer(csrfToken, organisation.id, trimmed));
      setPending(undefined);
      setReason("");
    });
  };

  if (loadError !== undefined) {
    return (
      <Card title={t.issuersTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!rows) {
    return (
      <Card title={t.issuersTitle}>
        <Skeleton lines={3} testId="issuers-loading" />
      </Card>
    );
  }

  return (
    <Card title={t.issuersTitle} subtitle={t.issuersSubtitle}>
      <div className="stack">
        {rows.length === 0 ? (
          <EmptyState icon="◷">{t.issuersEmpty}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.issuersLegalNameLabel}</th>
                  <th>{t.issuersRegistrationLabel}</th>
                  <th>{t.issuersContactLabel}</th>
                  <th>{t.issuersAppliedLabel}</th>
                  <th>{t.issuersStateLabel}</th>
                  <th className="table__num">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((organisation) => (
                  <tr key={organisation.id} data-testid={`issuer-${organisation.id}`}>
                    <td>{organisation.legalName}</td>
                    <td className="num">{organisation.registrationNumber}</td>
                    <td>{organisation.contactEmail}</td>
                    <td>{formatDate(organisation.appliedAt)}</td>
                    <td>
                      <div className="stack stack--tight">
                        <Badge tone={stateTone(organisation.state)}>
                          {stateLabel(t, organisation.state)}
                        </Badge>
                        {organisation.canSubmitAssets && (
                          <span className="muted">{t.issuersCanSubmit}</span>
                        )}
                        {/* A refusal an applicant cannot understand is a wall,
                            not a decision — so the reason travels with the row. */}
                        {organisation.rejectionReason !== undefined && (
                          <span className="muted">{organisation.rejectionReason}</span>
                        )}
                        {/* A decision is taken by a person. The account id is
                            the fallback, not the label. */}
                        {organisation.decidedBy !== undefined && (
                          <span className="muted">
                            {t.issuersDecidedBy}{" "}
                            {organisation.decidedByLabel ?? organisation.decidedBy}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table__num">
                      <div className="table__actions">
                        {canStartReview(organisation.state) && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void run(() => api.startIssuerReview(csrfToken, organisation.id));
                            }}
                          >
                            {t.issuersStartReviewButton}
                          </Button>
                        )}
                        {canDecide(organisation.state) && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                void run(() => api.approveIssuer(csrfToken, organisation.id));
                              }}
                            >
                              {t.issuersApproveButton}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              onClick={() => {
                                openReasonDialog(organisation, "reject");
                              }}
                            >
                              {t.issuersRejectButton}
                            </Button>
                          </>
                        )}
                        {canSuspend(organisation.state) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              openReasonDialog(organisation, "suspend");
                            }}
                          >
                            {t.issuersSuspendButton}
                          </Button>
                        )}
                        {canReinstate(organisation.state) && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void run(() => api.reinstateIssuer(csrfToken, organisation.id));
                            }}
                          >
                            {t.issuersReinstateButton}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* One error, one place: while the dialog is open the message belongs
            next to the field it is about, not behind it as well. */}
        {actionError !== undefined && pending === undefined && (
          <p className="field__error" role="alert">
            {actionError}
          </p>
        )}
      </div>

      <Modal
        open={pending !== undefined}
        title={pending?.kind === "suspend" ? t.issuersSuspendTitle : t.issuersRejectTitle}
        onClose={() => {
          setPending(undefined);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPending(undefined);
              }}
            >
              {t.cancelButton}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() => {
                void submitReason();
              }}
            >
              {pending?.kind === "suspend"
                ? t.issuersConfirmSuspensionButton
                : t.issuersSendRejectionButton}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">
            {pending?.kind === "suspend" ? t.issuersSuspendHelp : t.issuersRejectHelp}{" "}
            {pending?.organisation.legalName}
          </p>
          <Field
            id="issuer-decision-reason"
            label={t.issuersReasonLabel}
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
