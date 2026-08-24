"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import type { ApiClient } from "./api";
import { readCsrfToken } from "./session";

export type SessionStatus = "loading" | "authed" | "anon";

export interface BrowserSession {
  status: SessionStatus;
  // The readable double-submit token. Empty until authenticated; threaded to
  // pages for state-changing requests.
  csrf: string;
  permissions: readonly string[];
  roles: readonly string[];
  // Re-read after a fresh login: permissions drive the nav, so flipping the
  // status alone left a signed-in user looking at an empty sidebar.
  reload: () => Promise<void>;
  clear: () => void;
}

// One definition of what a browser session IS on this platform: an httpOnly
// cookie the page cannot read, verified by asking /auth/session, plus the
// readable CSRF token. Three shells need that answer (admin, investor, issuer)
// and it must not drift between them — if the rule changes, this is the one
// file to edit.
//
// `accepts` is the caller's, because the shells differ on WHO may enter: the
// admin console wants an officer, the investor and issuer portals want a
// person. Everything else about establishing the session is identical.
export const useBrowserSession = (
  api: ApiClient,
  accepts: (kind: "investor" | "officer") => boolean,
): BrowserSession => {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [csrf, setCsrf] = useState<string>("");
  const [permissions, setPermissions] = useState<readonly string[]>([]);
  const [roles, setRoles] = useState<readonly string[]>([]);

  const reload = useCallback(async () => {
    try {
      const session = await api.getSession();
      if (!accepts(session.kind)) {
        setStatus("anon");
        return;
      }
      setCsrf(readCsrfToken() ?? "");
      setPermissions(session.permissions);
      setRoles(session.roles ?? []);
      setStatus("authed");
    } catch (failure) {
      // A RATE LIMIT is not a logout. Showing the sign-in panel to someone who
      // is signed in invites them to log in again, which spends the very
      // budget that just refused them. Stay as we are and let the next probe
      // answer; the platform is busy, the person is not signed out (K-27).
      if (failure instanceof ApiError && failure.status === 429) {
        return;
      }
      // Any other failed probe is "not signed in", not a broken screen: the
      // portals render their sign-in panel and the person can act.
      setStatus("anon");
    }
    // `accepts` belongs in the deps, so callers must pass a referentially
    // stable predicate (each shell defines one at module level). An inline
    // arrow here would rebuild the callback every render and re-probe forever.
  }, [api, accepts]);

  const clear = useCallback(() => {
    setStatus("anon");
    setCsrf("");
    setPermissions([]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, csrf, permissions, roles, reload, clear };
};
