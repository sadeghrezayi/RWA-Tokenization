"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApiClient,
  FormFieldDto,
  ChangeRequestDto,
  EvidenceContentDto,
  EvidenceDescriptorDto,
  OnboardingAnswersDto,
  OnboardingProgressDto,
  OnboardingStepDto,
} from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import {
  ONBOARDING_STEP_LABELS as STEP_LABELS,
  ONBOARDING_STEP_ORDER as STEP_ORDER,
} from "../../lib/onboarding";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Modal } from "../ui/modal";
import { Button, Card, EmptyState } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// A stored answer is not a sentence. A checkbox reads as accepted/declined,
// and an absent answer says so rather than showing an empty line the reviewer
// has to interpret.
const readable = (
  field: FormFieldDto,
  value: string | undefined,
  t: (typeof dictionaries)[Locale],
): string => {
  if (value === undefined || value.trim() === "") {
    return t.onboardingReviewNotAnswered;
  }
  if (field.type === "checkbox") {
    return value === "true" ? t.onboardingReviewAccepted : t.onboardingReviewDeclined;
  }
  return value;
};

const kilobytes = (bytes: number): string => `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;

// 2.3f: what the compliance officer reads before deciding.
//
// Documents are fetched ONE AT A TIME, on request: opening an applicant's file
// must not decrypt every identity document they have uploaded, and a reviewer
// who never opens one leaves no decryption behind.
export const OnboardingReviewCard = ({
  locale,
  api,
  csrfToken,
  investorId,
}: {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
  investorId: string;
}) => {
  const t = dictionaries[locale];
  const [application, setApplication] = useState<OnboardingProgressDto | undefined>(undefined);
  const [started, setStarted] = useState<boolean | undefined>(undefined);
  const [answers, setAnswers] = useState<OnboardingAnswersDto | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [viewing, setViewing] = useState<EvidenceContentDto | undefined>(undefined);
  const [undisplayable, setUndisplayable] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<Partial<Record<OnboardingStepDto, string>>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [status, stored] = await Promise.all([
        api.getApplicantOnboarding(investorId),
        api.getApplicantAnswers(investorId),
      ]);
      setStarted(status.started);
      setApplication(status.application);
      setAnswers(stored);
      setLoadError(undefined);
    } catch (error) {
      // "Could not read this application" and "there is no application" are
      // different facts, and a reviewer must not confuse them.
      setLoadError(messageOf(error));
    }
  }, [api, investorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = async (descriptor: EvidenceDescriptorDto) => {
    setBusy(true);
    try {
      setUndisplayable(false);
      setViewing(await api.getEvidence(descriptor.reference));
      setActionError(undefined);
    } catch (error) {
      // A document that will not decrypt is a finding, not a blank frame.
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    const requests: ChangeRequestDto[] = STEP_ORDER.flatMap((step) => {
      const reason = (reasons[step] ?? "").trim();
      return reason === "" ? [] : [{ step, reason }];
    });
    if (requests.length === 0) {
      setActionError(t.onboardingReviewNeedsReason);
      return;
    }
    setBusy(true);
    try {
      setApplication(await api.requestOnboardingChanges(csrfToken, investorId, requests));
      setAsking(false);
      setReasons({});
      setActionError(undefined);
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  if (loadError !== undefined) {
    return (
      <Card title={t.onboardingReviewTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
      </Card>
    );
  }

  if (started === undefined) {
    return (
      <Card title={t.onboardingReviewTitle}>
        <p className="muted">{t.onboardingReviewLoading}</p>
      </Card>
    );
  }

  if (!started || !application || !answers) {
    return (
      <Card title={t.onboardingReviewTitle}>
        <EmptyState icon="◔">{t.onboardingReviewNotStarted}</EmptyState>
      </Card>
    );
  }

  const submitted = application.status === "submitted";

  return (
    <Card
      title={t.onboardingReviewTitle}
      subtitle={answers.form.notice}
      actions={
        <Badge tone={submitted ? "info" : "warning"}>
          {submitted ? t.onboardingUnderReview : t.onboardingChangesRequested}
        </Badge>
      }
    >
      <div className="stack">
        {application.submittedAt !== undefined && (
          <p className="muted">
            {t.onboardingReviewSubmittedAt}: {formatDateTime(application.submittedAt)}
          </p>
        )}

        {application.changeRequests.length > 0 && (
          <div className="callout callout--warning" role="status">
            <p>{t.onboardingReviewAlreadyAsked}</p>
            <ul>
              {application.changeRequests.map((request) => (
                <li key={request.step}>
                  <strong>{STEP_LABELS[request.step]}</strong>: {request.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {STEP_ORDER.map((step) => {
          const fields = answers.form.steps[step];
          const given = answers.answers[step] ?? {};
          if (fields.length === 0) {
            return null;
          }
          return (
            <section key={step} className="stack">
              <h3 className="card__subtitle">{STEP_LABELS[step]}</h3>
              <dl className="terms">
                {fields.map((field) => (
                  <div key={field.name}>
                    <dt>{field.label}</dt>
                    <dd>{readable(field, given[field.name], t)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        <section className="stack">
          <h3 className="card__subtitle">{STEP_LABELS.identity_evidence}</h3>
          {application.evidence.length === 0 ? (
            <EmptyState icon="◫">{t.onboardingNoDocuments}</EmptyState>
          ) : (
            <ul className="list">
              {application.evidence.map((document) => (
                <li key={document.reference} className="list__row">
                  <span>{document.filename}</span>
                  <span className="muted">{kilobytes(document.byteSize)}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void openDocument(document);
                    }}
                  >
                    {t.onboardingReviewViewButton}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {submitted && (
          <div className="row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setActionError(undefined);
                setAsking(true);
              }}
            >
              {t.onboardingReviewRequestChanges}
            </Button>
          </div>
        )}

        {/* One error, one place: while the send-back dialog is open the message
            belongs next to the fields it is about, not behind it as well. */}
        {actionError !== undefined && !asking && (
          <p className="field__error" role="alert">
            {actionError}
          </p>
        )}
      </div>

      <Modal
        open={viewing !== undefined}
        title={viewing?.filename ?? ""}
        onClose={() => {
          setViewing(undefined);
        }}
      >
        {/* A corrupt or truncated upload renders as nothing; saying so is more
            use to a reviewer than a broken-image icon. */}
        {viewing && undisplayable && (
          <p className="field__error" role="status">
            {t.onboardingReviewUndisplayable}
          </p>
        )}
        {viewing &&
          (viewing.contentType.startsWith("image/") ? (
            <img
              className="evidence-view"
              src={`data:${viewing.contentType};base64,${viewing.contentBase64}`}
              alt={viewing.filename}
              onError={() => {
                setUndisplayable(true);
              }}
            />
          ) : (
            // A PDF renders in an object element; the data URI keeps the
            // document inside the authenticated page rather than at a URL that
            // could be shared or leak through a referrer.
            <object
              className="evidence-view"
              data={`data:${viewing.contentType};base64,${viewing.contentBase64}`}
              type={viewing.contentType}
              aria-label={viewing.filename}
            >
              <p>{viewing.filename}</p>
            </object>
          ))}
      </Modal>

      <Modal
        open={asking}
        title={t.onboardingReviewRequestChanges}
        onClose={() => {
          setAsking(false);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t.onboardingReviewCancel}
            </Button>
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                void sendBack();
              }}
            >
              {t.onboardingReviewSendBack}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">{t.onboardingReviewReasonHelp}</p>
          {STEP_ORDER.map((step) => (
            <div key={step} className="field">
              <label className="field__label" htmlFor={`reason-${step}`}>
                {STEP_LABELS[step]}
              </label>
              <textarea
                id={`reason-${step}`}
                className="field__input"
                rows={2}
                value={reasons[step] ?? ""}
                onChange={(event) => {
                  setReasons((previous) => ({ ...previous, [step]: event.target.value }));
                }}
              />
            </div>
          ))}
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
