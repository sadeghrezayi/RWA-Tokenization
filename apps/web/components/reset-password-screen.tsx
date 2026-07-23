"use client";

import { useMemo } from "react";
import { createApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { ResetPasswordPanel } from "./reset-password-panel";

// Standalone (shell-free) screen the emailed reset link lands on. Builds the
// browser api client and centers the reset panel under the platform brand.
export const ResetPasswordScreen = ({
  locale,
  token,
}: {
  locale: Locale;
  token: string | undefined;
}) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  return (
    <div className="auth-screen">
      <div className="auth-screen__inner stack">
        <div className="brand brand--lg">
          <span className="brand__logo" aria-hidden="true">
            ◈
          </span>
          <span>{t.appTitle}</span>
        </div>
        <ResetPasswordPanel locale={locale} api={api} token={token} />
      </div>
    </div>
  );
};
