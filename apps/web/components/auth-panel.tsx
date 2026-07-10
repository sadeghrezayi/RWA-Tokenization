"use client";

import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface AuthPanelProps {
  locale: Locale;
  api: ApiClient;
  onAuthed: (token: string) => void;
}

// Register-or-login in one card; registration logs in right after (FR-ID-1).
export const AuthPanel = ({ locale, api, onAuthed }: AuthPanelProps) => {
  const t = dictionaries[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const login = async () => {
    const { token } = await api.login(email, password);
    onAuthed(token);
  };

  return (
    <section className="card">
      <h2>{t.registerTitle}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(login);
        }}
      >
        <label htmlFor="auth-email">{t.emailLabel}</label>
        <input
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <label htmlFor="auth-password">{t.passwordLabel}</label>
        <input
          id="auth-password"
          type="password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <div>
          <button type="submit" disabled={busy}>
            {t.loginButton}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await api.register(email, password);
                await login();
              });
            }}
          >
            {t.registerButton}
          </button>
        </div>
      </form>
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
};
