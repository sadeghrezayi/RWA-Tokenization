"use client";

import { createContext, useContext } from "react";
import type { ApiClient } from "../../lib/api";
import type { Locale } from "../../lib/i18n";

// The authenticated investor session, shared across the portal routes.
export interface InvestorSession {
  api: ApiClient;
  token: string;
  locale: Locale;
}

// Matches the key the portal has always used (kept for continuity).
export const INVESTOR_TOKEN_KEY = "tokenization.token";

const InvestorSessionContext = createContext<InvestorSession | undefined>(undefined);

export const InvestorSessionProvider = InvestorSessionContext.Provider;

export const useInvestorSession = (): InvestorSession => {
  const session = useContext(InvestorSessionContext);
  if (session === undefined) {
    throw new Error("useInvestorSession must be used within the investor shell");
  }
  return session;
};
