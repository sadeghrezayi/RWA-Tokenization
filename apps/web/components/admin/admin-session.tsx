"use client";

import { createContext, useContext } from "react";
import type { ApiClient } from "../../lib/api";
import type { Locale } from "../../lib/i18n";

// The authenticated officer session, shared across every admin route so pages
// don't each re-read sessionStorage or thread props. Provided by AdminShell.
export interface AdminSession {
  api: ApiClient;
  token: string;
  locale: Locale;
}

const AdminSessionContext = createContext<AdminSession | undefined>(undefined);

export const AdminSessionProvider = AdminSessionContext.Provider;

export const useAdminSession = (): AdminSession => {
  const session = useContext(AdminSessionContext);
  if (session === undefined) {
    throw new Error("useAdminSession must be used within the admin shell");
  }
  return session;
};
