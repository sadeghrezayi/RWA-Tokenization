"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, MfaStatusDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, Field } from "../ui/primitives";

export interface OfficerSecurityCardProps {
  locale: Locale;
  api: ApiClient;
  // CSRF token for the authenticated state-changing MFA calls.
  token: string;
}

// T4 officer MFA management: enable (enroll → confirm → recovery codes),
// see status, and disable. QR rendering would need a new UI dependency (against
// the zero-dep mandate), so the setup key is shown for manual entry instead.
export const OfficerSecurityCard = ({ locale, api, token }: OfficerSecurityCardProps) => {
  const t = dictionaries[locale];
  const [status, setStatus] = useState<"loading" | MfaStatusDto>("loading");
  const [enrollment, setEnrollment] = useState<{ secret: string; keyUri: string } | undefined>();
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus((await api.officerMfaStatus()).status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startEnroll = () =>
    run(async () => {
      setEnrollment(await api.officerMfaEnroll(token));
    });

  const confirm = () =>
    run(async () => {
      const { recoveryCodes: codes } = await api.officerMfaConfirm(token, code);
      setRecoveryCodes(codes);
      setEnrollment(undefined);
      setCode("");
      setStatus("active");
    });

  const disable = () =>
    run(async () => {
      await api.officerMfaDisable(token);
      setRecoveryCodes(undefined);
      setStatus("none");
    });

  const active = status === "active";

  return (
    <Card
      title={t.mfaCardTitle}
      subtitle={t.securitySubtitle}
      actions={
        status !== "loading" && (
          <Badge tone={active ? "success" : "neutral"}>
            {active ? t.mfaStatusActiveLabel : t.mfaStatusInactiveLabel}
          </Badge>
        )
      }
    >
      <div className="stack">
        {status === "loading" && <p className="muted">Loading…</p>}

        {recoveryCodes !== undefined && (
          <div className="stack">
            <h3>{t.mfaRecoveryTitle}</h3>
            <p className="muted">{t.mfaRecoveryHint}</p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "0.25rem",
              }}
            >
              {recoveryCodes.map((rc) => (
                <li key={rc}>
                  <code style={{ letterSpacing: "0.08em", userSelect: "all" }}>{rc}</code>
                </li>
              ))}
            </ul>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRecoveryCodes(undefined);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {recoveryCodes === undefined && enrollment !== undefined && (
          <form
            className="stack"
            style={{ maxWidth: "24rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <p className="muted">{t.mfaScanInstruction}</p>
            <div className="field">
              <span className="field__label">{t.mfaSetupKeyLabel}</span>
              <code style={{ fontSize: "1.05rem", letterSpacing: "0.12em", userSelect: "all" }}>
                {enrollment.secret}
              </code>
            </div>
            <Field
              id="officer-mfa-enroll-code"
              label={t.mfaCodeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
            />
            <div>
              <Button type="submit" loading={busy}>
                {t.mfaConfirmButton}
              </Button>
            </div>
          </form>
        )}

        {recoveryCodes === undefined && enrollment === undefined && active && (
          <div className="stack">
            <p>{t.mfaEnabledNotice}</p>
            <div>
              <Button
                type="button"
                variant="danger"
                loading={busy}
                onClick={() => {
                  void disable();
                }}
              >
                {t.mfaDisableButton}
              </Button>
            </div>
          </div>
        )}

        {recoveryCodes === undefined &&
          enrollment === undefined &&
          (status === "none" || status === "pending") && (
            <div className="stack">
              <p className="muted">{t.mfaScanInstruction}</p>
              <div>
                <Button
                  type="button"
                  loading={busy}
                  onClick={() => {
                    void startEnroll();
                  }}
                >
                  {t.mfaEnableButton}
                </Button>
              </div>
            </div>
          )}

        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
};
