"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Button, Card, Field } from "./ui/primitives";

export interface ResetPasswordPanelProps {
  locale: Locale;
  api: ApiClient;
  // The single-use token from the emailed link (?token=...). Absent if the user
  // reached this page without one.
  token: string | undefined;
}

// T4 self-service reset — redemption view. Confirms the two entries match
// client-side (cheap guard), then submits the token + new password. Server-side
// policy and token validity are the source of truth; their errors surface here.
export const ResetPasswordPanel = ({ locale, api, token }: ResetPasswordPanelProps) => {
  const t = dictionaries[locale];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const base = `/${locale}`;

  if (token === undefined || token === "") {
    return (
      <Card title={t.resetTitle}>
        <div className="stack" style={{ maxWidth: "24rem" }}>
          <p role="alert">{t.resetMissingToken}</p>
          <Link href={base} className="btn btn--secondary">
            {t.backToSignIn}
          </Link>
        </div>
      </Card>
    );
  }

  if (done) {
    return (
      <Card title={t.resetTitle}>
        <div className="stack" style={{ maxWidth: "24rem" }}>
          <p role="status">{t.resetSuccess}</p>
          <Link href={base} className="btn btn--primary">
            {t.backToSignIn}
          </Link>
        </div>
      </Card>
    );
  }

  const submit = () => {
    if (password !== confirm) {
      setError(t.resetPasswordMismatch);
      return;
    }
    setBusy(true);
    setError(undefined);
    api
      .resetPassword(token, password)
      .then(() => {
        setDone(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card title={t.resetTitle} subtitle={t.resetSubtitle}>
      <form
        className="stack"
        style={{ maxWidth: "24rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          id="reset-new-password"
          label={t.newPasswordLabel}
          type="password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <Field
          id="reset-confirm-password"
          label={t.confirmPasswordLabel}
          type="password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
        />
        <div className="row">
          <Button type="submit" loading={busy}>
            {t.resetSubmit}
          </Button>
          <Link href={base} className="btn btn--ghost">
            {t.backToSignIn}
          </Link>
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
