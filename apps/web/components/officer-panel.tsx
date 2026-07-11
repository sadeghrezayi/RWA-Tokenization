"use client";

import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorViewDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

// FR-ID-4 subset: officer signs in, sees the pending queue, approves/rejects.
export const OfficerPanel = ({
  locale,
  api,
  onAuthed,
}: {
  locale: Locale;
  api: ApiClient;
  onAuthed?: (token: string) => void;
}) => {
  const t = dictionaries[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<InvestorViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const guard = async (action: () => Promise<void>) => {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    }
  };

  const refresh = async (officerToken: string) => {
    setPending(await api.pendingKyc(officerToken));
  };

  if (token === undefined) {
    return (
      <section className="card">
        <h2>{t.officerTitle}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void guard(async () => {
              const result = await api.officerLogin(email, password);
              setToken(result.token);
              onAuthed?.(result.token);
              await refresh(result.token);
            });
          }}
        >
          <label htmlFor="officer-email">{t.emailLabel}</label>
          <input
            id="officer-email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
          <label htmlFor="officer-password">{t.passwordLabel}</label>
          <input
            id="officer-password"
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <button type="submit">{t.loginButton}</button>
        </form>
        {error !== undefined && <p role="alert">{error}</p>}
      </section>
    );
  }

  const review = (investor: InvestorViewDto, decide: () => Promise<void>) =>
    guard(async () => {
      if (investor.kycState === "submitted") {
        await api.startReview(token, investor.id);
      }
      await decide();
      await refresh(token);
    });

  return (
    <section className="card">
      <h2>{t.pendingKycTitle}</h2>
      {pending.length === 0 ? (
        <p>{t.emptyQueue}</p>
      ) : (
        <ul>
          {pending.map((investor) => (
            <li key={investor.id}>
              <span>{investor.email}</span> — <span>{t.kycStates[investor.kycState]}</span>{" "}
              <button
                type="button"
                onClick={() => {
                  void review(investor, () => api.approve(token, investor.id));
                }}
              >
                {t.approveButton}
              </button>
              <button
                type="button"
                onClick={() => {
                  const reason = window.prompt(t.rejectReasonPrompt) ?? "";
                  if (reason.trim() !== "") {
                    void review(investor, () => api.reject(token, investor.id, reason));
                  }
                }}
              >
                {t.rejectButton}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
};
