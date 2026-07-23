"use client";

import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Button, Card, Field } from "./ui/primitives";

export interface AuthPanelProps {
  locale: Locale;
  api: ApiClient;
  onAuthed: () => void;
}

// Register-or-login in one card; registration logs in right after (FR-ID-1).
// A "Forgot password?" link switches to the self-service reset-request view
// (T4). That view never confirms whether the email is registered.
export const AuthPanel = ({ locale, api, onAuthed }: AuthPanelProps) => {
  const t = dictionaries[locale];
  const [mode, setMode] = useState<"auth" | "forgot">("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  // On success the API sets the httpOnly session cookie; nothing to store here.
  const login = async () => {
    await api.login(email, password);
    onAuthed();
  };

  const showForgot = () => {
    setMode("forgot");
    setError(undefined);
    setResetSent(false);
  };
  const showAuth = () => {
    setMode("auth");
    setError(undefined);
  };

  if (mode === "forgot") {
    return (
      <Card title={t.resetRequestTitle} subtitle={t.resetRequestSubtitle}>
        {resetSent ? (
          <div className="stack" style={{ maxWidth: "24rem" }}>
            <p role="status">{t.resetRequestSent}</p>
            <Button type="button" variant="secondary" onClick={showAuth}>
              {t.backToSignIn}
            </Button>
          </div>
        ) : (
          <form
            className="stack"
            style={{ maxWidth: "24rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await api.requestPasswordReset(email);
                setResetSent(true);
              });
            }}
          >
            <Field
              id="reset-email"
              label={t.emailLabel}
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <div className="row">
              <Button type="submit" loading={busy}>
                {t.sendResetLink}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={showAuth}>
                {t.backToSignIn}
              </Button>
            </div>
            {error !== undefined && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card title={t.registerTitle} subtitle="Sign in, or create an account to get started.">
      <form
        className="stack"
        style={{ maxWidth: "24rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          void run(login);
        }}
      >
        <Field
          id="auth-email"
          label={t.emailLabel}
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Field
          id="auth-password"
          label={t.passwordLabel}
          type="password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <div className="row">
          <Button type="submit" loading={busy}>
            {t.loginButton}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await api.register(email, password);
                await login();
              });
            }}
          >
            {t.registerButton}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={showForgot}>
          {t.forgotPassword}
        </Button>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
};
