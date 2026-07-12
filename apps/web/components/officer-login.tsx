"use client";

import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Button, Card, Field } from "./ui/primitives";

// Officer sign-in card. Auth is owned by the admin page so it survives tab
// switches; this only collects credentials and hands the token up.
export const OfficerLogin = ({
  locale,
  api,
  onAuthed,
}: {
  locale: Locale;
  api: ApiClient;
  onAuthed: (token: string) => void;
}) => {
  const t = dictionaries[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  return (
    <Card title={t.officerTitle} subtitle="Sign in to review KYC and manage the platform.">
      <form
        className="stack"
        style={{ maxWidth: "24rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void (async () => {
            try {
              const { token } = await api.officerLogin(email, password);
              onAuthed(token);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : t.authFailed);
            } finally {
              setBusy(false);
            }
          })();
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
