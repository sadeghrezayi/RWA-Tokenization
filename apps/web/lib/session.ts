// Cookie-session helpers (1.3b). The JWT lives in an httpOnly cookie the browser
// cannot read; the readable CSRF cookie is echoed on state-changing requests
// (double-submit). No session token is ever kept in JS storage.
export const CSRF_COOKIE = "tk_csrf";

// Reads the current CSRF token from document.cookie. Returns undefined server-
// side (no document) or when there is no session.
export const readCsrfToken = (): string | undefined => {
  if (typeof document === "undefined") {
    return undefined;
  }
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
};
