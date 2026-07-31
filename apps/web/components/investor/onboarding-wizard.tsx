"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiClient,
  FormFieldDto,
  OnboardingFormDto,
  OnboardingProgressDto,
  OnboardingStepDto,
  StepAnswersDto,
} from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, SelectField, Skeleton } from "../ui/primitives";
import { Stepper } from "../ui/stepper";

export interface OnboardingWizardProps {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
}

const STEP_ORDER: OnboardingStepDto[] = [
  "profile",
  "identity_evidence",
  "bank_account",
  "suitability",
  "agreements",
];

const STEP_LABELS: Record<OnboardingStepDto, string> = {
  profile: "Your details",
  identity_evidence: "Identity document",
  bank_account: "Bank account",
  suitability: "Suitability",
  agreements: "Agreements",
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const kilobytes = (bytes: number): string => `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;

// 2.3e: the applicant's onboarding wizard.
//
// The field set is NOT defined here — the server owns it (and marks it
// provisional, pending local legal validation). This renders whatever the API
// describes, so what an applicant must provide can change without a web
// release, and the two sides can never disagree about what was asked.
export const OnboardingWizard = ({ locale, api, csrfToken }: OnboardingWizardProps) => {
  const t = dictionaries[locale];
  const [form, setForm] = useState<OnboardingFormDto | undefined>(undefined);
  const [application, setApplication] = useState<OnboardingProgressDto | undefined>(undefined);
  const [started, setStarted] = useState<boolean | undefined>(undefined);
  const [current, setCurrent] = useState<OnboardingStepDto>("profile");
  const [draft, setDraft] = useState<StepAnswersDto>({});
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const savedAnswers = useRef<Partial<Record<OnboardingStepDto, StepAnswersDto>>>({});

  const load = useCallback(async () => {
    try {
      const [status, stored] = await Promise.all([api.getOnboarding(), api.getOnboardingAnswers()]);
      savedAnswers.current = stored.answers;
      setForm(stored.form);
      setStarted(status.started);
      setApplication(status.application);
      setLoadError(undefined);
    } catch (error) {
      // An unreadable application must never render as an empty wizard — the
      // applicant would re-enter everything on top of data that already exists.
      setLoadError(messageOf(error));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // A field shows what the applicant has typed, falling back to what is stored.
  // Reading through like this (rather than copying stored answers into the
  // draft) means a value is never missing because a fetch had not resolved yet,
  // and an emptied field stays empty — "" is an answer, not an absence.
  useEffect(() => {
    setDraft({});
    setActionError(undefined);
  }, [current]);

  const valueOf = (name: string): string =>
    draft[name] ?? savedAnswers.current[current]?.[name] ?? "";

  const changeRequests = application?.changeRequests ?? [];
  const reopened = useMemo(() => changeRequests.map((request) => request.step), [changeRequests]);
  const readOnly = application?.status === "submitted";
  const ready = !readOnly && (application?.outstandingSteps.length ?? 1) === 0;
  const fields: FormFieldDto[] = form?.steps[current] ?? [];

  const run = async (work: () => Promise<OnboardingProgressDto>) => {
    setBusy(true);
    try {
      const updated = await work();
      setApplication(updated);
      setStarted(true);
      setActionError(undefined);
      return true;
    } catch (error) {
      // The draft is deliberately left untouched: losing a filled-in form on a
      // validation error is the fastest way to make someone abandon onboarding.
      setActionError(messageOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveStep = async () => {
    const answers = Object.fromEntries(fields.map((field) => [field.name, valueOf(field.name)]));
    const ok = await run(() => api.saveOnboardingAnswers(csrfToken, current, answers));
    if (ok) {
      savedAnswers.current = { ...savedAnswers.current, [current]: answers };
      const next = STEP_ORDER[STEP_ORDER.indexOf(current) + 1];
      if (next) setCurrent(next);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await api.uploadEvidence(csrfToken, "identity_evidence", file);
      await load();
      setActionError(undefined);
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (loadError !== undefined) {
    return (
      <Card title={t.onboardingTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void load();
          }}
        >
          {t.refreshButton}
        </Button>
      </Card>
    );
  }

  if (started === undefined || form === undefined) {
    return (
      <Card title={t.onboardingTitle}>
        <Skeleton lines={4} testId="onboarding-loading" />
      </Card>
    );
  }

  if (!started || !application) {
    return (
      <Card title={t.onboardingTitle} subtitle={t.onboardingIntro}>
        <div className="stack">
          <EmptyState icon="◔">{t.onboardingNotStarted}</EmptyState>
          <div className="row">
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                void run(() => api.startOnboarding(csrfToken));
              }}
            >
              {t.onboardingStartButton}
            </Button>
          </div>
          {actionError !== undefined && (
            <p className="field__error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </Card>
    );
  }

  const currentRequest = changeRequests.find((request) => request.step === current);

  return (
    <Card
      title={t.onboardingTitle}
      subtitle={form.notice}
      actions={
        <Badge
          tone={
            readOnly ? "info" : application.status === "changes_requested" ? "warning" : "neutral"
          }
        >
          {readOnly
            ? t.onboardingUnderReview
            : application.status === "changes_requested"
              ? t.onboardingChangesRequested
              : t.onboardingInProgress}
        </Badge>
      }
    >
      <div className="stack">
        <Stepper
          steps={STEP_ORDER.map((step) => ({ id: step, label: STEP_LABELS[step] }))}
          current={current}
          completed={application.completedSteps}
          changesRequested={reopened}
          onSelect={(id) => {
            setCurrent(id as OnboardingStepDto);
          }}
        />

        {readOnly && <p role="status">{t.onboardingUnderReviewBody}</p>}

        {changeRequests.length > 0 && (
          <div className="callout callout--warning" role="status">
            <p>{t.onboardingChangesIntro}</p>
            <ul>
              {changeRequests.map((request) => (
                <li key={request.step}>
                  <strong>{STEP_LABELS[request.step]}</strong>: {request.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {current === "identity_evidence" ? (
          <div className="stack">
            <p className="muted">{t.onboardingEvidenceHelp}</p>
            {application.evidence.length === 0 ? (
              <EmptyState icon="◫">{t.onboardingNoDocuments}</EmptyState>
            ) : (
              <ul className="list">
                {application.evidence.map((document) => (
                  <li key={document.reference} className="list__row">
                    <span>{document.filename}</span>
                    <span className="muted">{kilobytes(document.byteSize)}</span>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void run(() => api.removeEvidence(csrfToken, document.reference));
                        }}
                      >
                        {t.onboardingRemoveDocument}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <>
                <label className="field">
                  <span className="field__label">{t.onboardingUploadLabel}</span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                </label>
                <div className="row">
                  <Button
                    type="button"
                    variant={ready ? "secondary" : "primary"}
                    loading={busy}
                    disabled={application.evidence.length === 0}
                    onClick={() => {
                      void run(() =>
                        api.completeOnboardingStep(csrfToken, "identity_evidence"),
                      ).then((ok) => {
                        if (ok) setCurrent("bank_account");
                      });
                    }}
                  >
                    {t.onboardingContinueButton}
                  </Button>
                  {ready && (
                    <Button
                      type="button"
                      loading={busy}
                      onClick={() => {
                        void run(() => api.submitOnboarding(csrfToken));
                      }}
                    >
                      {t.onboardingSubmitButton}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="stack">
            {currentRequest && (
              <p className="field__error" role="status">
                {currentRequest.reason}
              </p>
            )}
            {fields.map((field) =>
              field.type === "select" ? (
                <SelectField
                  key={field.name}
                  id={`onboarding-${field.name}`}
                  label={field.label}
                  value={valueOf(field.name)}
                  disabled={readOnly || busy}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, [field.name]: event.target.value }));
                  }}
                >
                  <option value="">{t.onboardingChoosePlaceholder}</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
              ) : field.type === "checkbox" ? (
                <label key={field.name} className="field field--inline">
                  <input
                    type="checkbox"
                    checked={valueOf(field.name) === "true"}
                    disabled={readOnly || busy}
                    onChange={(event) => {
                      setDraft((previous) => ({
                        ...previous,
                        [field.name]: event.target.checked ? "true" : "false",
                      }));
                    }}
                  />
                  <span className="field__label">{field.label}</span>
                </label>
              ) : (
                <Field
                  key={field.name}
                  id={`onboarding-${field.name}`}
                  label={field.label}
                  type={field.type === "date" ? "date" : "text"}
                  value={valueOf(field.name)}
                  {...(field.help !== undefined ? { hint: field.help } : {})}
                  disabled={readOnly || busy}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, [field.name]: event.target.value }));
                  }}
                />
              ),
            )}
            {!readOnly && (
              <div className="row">
                {/* Once every step is done the submit becomes the primary
                    action; saving again is still possible, but demoted so the
                    two do not compete for the same attention. */}
                <Button
                  type="button"
                  variant={ready ? "secondary" : "primary"}
                  loading={busy}
                  onClick={() => {
                    void saveStep();
                  }}
                >
                  {t.onboardingSaveButton}
                </Button>
                {ready && (
                  <Button
                    type="button"
                    loading={busy}
                    onClick={() => {
                      void run(() => api.submitOnboarding(csrfToken));
                    }}
                  >
                    {t.onboardingSubmitButton}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {actionError !== undefined && (
          <p className="field__error" role="alert">
            {actionError}
          </p>
        )}
      </div>
    </Card>
  );
};
