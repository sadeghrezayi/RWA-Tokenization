"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

export interface RegisterFormProps {
  locale: Locale;
  api: ApiClient;
  onRegistered: (investorId: string) => void;
}

export const RegisterForm = ({ locale, api, onRegistered }: RegisterFormProps) => {
  const t = dictionaries[locale];
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { investorId } = await api.register(email);
      onRegistered(investorId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.registerFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>{t.registerTitle}</h2>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label htmlFor="register-email">{t.emailLabel}</label>
        <input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <button type="submit" disabled={busy}>
          {t.registerButton}
        </button>
      </form>
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
};
