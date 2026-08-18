"use client";

import { createContext, useContext } from "react";
import type { ApiClient } from "../../lib/api";
import type { Locale } from "../../lib/i18n";

// The authenticated session of a person acting for an issuer, shared across the
// issuer routes. Separate from the investor session because the two portals
// answer to different people and will grow apart, even though a person may hold
// both roles on one account today.
export interface IssuerSession {
  api: ApiClient;
  token: string;
  locale: Locale;
}

const IssuerSessionContext = createContext<IssuerSession | undefined>(undefined);

export const IssuerSessionProvider = IssuerSessionContext.Provider;

export const useIssuerSession = (): IssuerSession => {
  const session = useContext(IssuerSessionContext);
  if (session === undefined) {
    throw new Error("useIssuerSession must be used within the issuer shell");
  }
  return session;
};
