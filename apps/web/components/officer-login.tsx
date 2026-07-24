"use client";

import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Button, Card, Field } from "./ui/primitives";

// Officer sign-in. On success the API sets the httpOnly session cookie; this
// only collects credentials and signals success (no token touches JS). When the
// officer has MFA enabled, password succeeds into an "mfaRequired" challenge and
// this card switches to a code prompt (T4).
export const OfficerLogin = ({
  locale,
  api,
  onAuthed,
}: {
  locale: Locale;
  api: ApiClient;
  onAuthed: () => void;
}) => {
  const t = dictionaries[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = () =>
    run(async () => {
      const result = await api.officerLogin(email, password);
      if ("mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        return; // switch to the code prompt; no session yet
      }
      onAuthed();
    });

  const submitCode = () =>
    run(async () => {
      if (mfaToken === undefined) return;
      await api.officerMfa(mfaToken, code);
      onAuthed();
    });

  if (mfaToken !== undefined) {
    return (
      <Card title={t.mfaChallengeTitle} subtitle={t.mfaChallengeSubtitle}>
        <form
          className="stack"
          style={{ maxWidth: "24rem" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitCode();
          }}
        >
          <Field
            id="officer-mfa-code"
            label={t.mfaCodeLabel}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            hint={t.mfaCodeHint}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
          <div>
            <Button type="submit" loading={busy}>
              {t.mfaVerifyButton}
            </Button>
          </div>
          {error !== undefined && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card title={t.officerTitle} subtitle="Sign in to review KYC and manage the platform.">
      <form
        className="stack"
        style={{ maxWidth: "24rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          void submitPassword();
        }}
      >
        <Field
          id="officer-email"
          label={t.emailLabel}
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Field
          id="officer-password"
          label={t.passwordLabel}
          type="password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <div>
          <Button type="submit" loading={busy}>
            {t.loginButton}
          </Button>
        </div>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
};
