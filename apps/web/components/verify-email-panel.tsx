"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Button, Card } from "./ui/primitives";

export interface VerifyEmailPanelProps {
  locale: Locale;
  api: ApiClient;
  // The single-use token from the emailed link (?token=...). Absent if the user
  // reached this page without one.
  token: string | undefined;
}

// T4 email-verification — redemption view. Verification is a state change, so it
// is a deliberate button click (not an on-load POST): email link-scanners issue
// GETs and must never consume the token.
export const VerifyEmailPanel = ({ locale, api, token }: VerifyEmailPanelProps) => {
  const t = dictionaries[locale];
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const base = `/${locale}`;

  if (token === undefined || token === "") {
    return (
      <Card title={t.verifyEmailTitle}>
        <div className="stack" style={{ maxWidth: "24rem" }}>
          <p role="alert">{t.verifyMissingToken}</p>
          <Link href={base} className="btn btn--secondary">
            {t.backToSignIn}
          </Link>
        </div>
      </Card>
    );
  }

  if (done) {
    return (
      <Card title={t.verifyEmailTitle}>
        <div className="stack" style={{ maxWidth: "24rem" }}>
          <p role="status">{t.verifyEmailSuccess}</p>
          <Link href={base} className="btn btn--primary">
            {t.backToSignIn}
          </Link>
        </div>
      </Card>
    );
  }

  const verify = () => {
    setBusy(true);
    setError(undefined);
    api
      .verifyEmail(token)
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
    <Card title={t.verifyEmailTitle} subtitle={t.verifyEmailSubtitle}>
      <div className="stack" style={{ maxWidth: "24rem" }}>
        <div className="row">
          <Button
            type="button"
            loading={busy}
            onClick={() => {
              verify();
            }}
          >
            {t.verifyEmailButton}
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
      </div>
    </Card>
  );
};
