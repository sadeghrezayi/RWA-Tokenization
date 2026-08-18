import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBrowserSession } from "../lib/use-browser-session";
import { CSRF_COOKIE } from "../lib/session";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const accepts = (kind: "investor" | "officer") => kind === "investor";

// The client is built ONCE and the predicate lives at module scope, exactly as
// every shell does it (`useMemo(() => createApiClient(), [])`). Both are in the
// probe's dependencies, so a fresh object per render would re-probe on every
// render — a live-lock this hook cannot defend against from the inside.
const withSession = (getSession: ApiClient["getSession"]) => {
  const api = stubApi({ getSession });
  return renderHook(() => useBrowserSession(api, accepts));
};

// One rule, three portals. If this drifts, every shell drifts with it — which
// is exactly why it was extracted instead of copied a third time.
describe("useBrowserSession", () => {
  it("authenticates a session the caller accepts, and reads the CSRF token", async () => {
    document.cookie = `${CSRF_COOKIE}=tok-123`;
    const { result } = withSession(
      vi.fn().mockResolvedValue({ kind: "investor", permissions: ["asset.manage"] }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("authed");
    });
    expect(result.current.permissions).toEqual(["asset.manage"]);
    expect(result.current.csrf).toBe("tok-123");
  });

  it("refuses a session of the wrong kind", async () => {
    // An officer reaching the investor portal is not signed in HERE. The shell
    // must show its sign-in panel rather than a half-authorised screen.
    const { result } = withSession(
      vi.fn().mockResolvedValue({ kind: "officer", permissions: ["issuer.manage"] }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("anon");
    });
    expect(result.current.permissions).toEqual([]);
  });

  it("treats a failed probe as not-signed-in rather than a broken screen", async () => {
    const { result } = withSession(vi.fn().mockRejectedValue(new Error("network")));

    await waitFor(() => {
      expect(result.current.status).toBe("anon");
    });
  });

  // A rate limit is not a logout. Rendering the sign-in panel to someone who
  // IS signed in invites them to log in again, which spends the credential
  // budget that refused them in the first place. Caught in CI: the holder's
  // portfolio showed the sign-in screen because /auth/session answered 429
  // while the session cookie was sitting right there (KNOWN_ISSUES K-27).
  it("does not call a rate-limited reader signed out", async () => {
    const getSession = vi.fn().mockRejectedValue(new ApiError(429, "too many requests"));
    const { result } = withSession(getSession);

    // Wait for the probe to have actually SETTLED. Asserting "not anon" while
    // the status is still its initial "loading" would pass without proving a
    // thing — which is exactly what the first draft of this test did.
    await waitFor(() => {
      expect(getSession).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("loading");
  });

  it("re-reads the session on demand, because a fresh login changes the answer", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ kind: "officer", permissions: [] })
      .mockResolvedValueOnce({ kind: "investor", permissions: ["asset.manage"] });
    const { result } = withSession(getSession);

    await waitFor(() => {
      expect(result.current.status).toBe("anon");
    });

    await act(async () => {
      await result.current.reload();
    });

    // Permissions drive the nav: flipping the status alone left a signed-in
    // user staring at an empty sidebar until they reloaded the page.
    expect(result.current.status).toBe("authed");
    expect(result.current.permissions).toEqual(["asset.manage"]);
  });

  it("clears everything on sign-out, leaving no CSRF token behind", async () => {
    document.cookie = `${CSRF_COOKIE}=tok-123`;
    const { result } = withSession(
      vi.fn().mockResolvedValue({ kind: "investor", permissions: ["asset.manage"] }),
    );
    await waitFor(() => {
      expect(result.current.status).toBe("authed");
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.status).toBe("anon");
    expect(result.current.csrf).toBe("");
    expect(result.current.permissions).toEqual([]);
  });
});
