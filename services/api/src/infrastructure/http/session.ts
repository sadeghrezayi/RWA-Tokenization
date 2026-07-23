import { randomBytes } from "node:crypto";
import { serializeCookie } from "./cookies.js";
import type { CookieOptions } from "./cookies.js";

// httpOnly session model (T4/T21). The JWT lives in an httpOnly cookie the
// browser cannot read (XSS can't exfiltrate it); a companion readable CSRF
// cookie drives the double-submit check for state-changing cookie requests.
export const SESSION_COOKIE = "tk_session";
export const CSRF_COOKIE = "tk_csrf";
export const CSRF_HEADER = "x-csrf-token";

// Access-token lifetime; kept in step with the JWT expiry (jwt-token-service).
const SESSION_MAX_AGE_SECONDS = 60 * 60;

const secure = (): boolean => process.env.NODE_ENV === "production";

const base = (maxAgeSeconds: number): CookieOptions => ({
  secure: secure(),
  sameSite: "Lax",
  path: "/",
  maxAgeSeconds,
});

export const newCsrfToken = (): string => randomBytes(24).toString("hex");

// Set-Cookie headers to establish a session: httpOnly JWT + readable CSRF.
export const sessionSetCookies = (token: string, csrf: string): string[] => [
  serializeCookie(SESSION_COOKIE, token, { ...base(SESSION_MAX_AGE_SECONDS), httpOnly: true }),
  serializeCookie(CSRF_COOKIE, csrf, { ...base(SESSION_MAX_AGE_SECONDS), httpOnly: false }),
];

// Set-Cookie headers that clear the session (logout / expiry).
export const sessionClearCookies = (): string[] => [
  serializeCookie(SESSION_COOKIE, "", { ...base(0), httpOnly: true }),
  serializeCookie(CSRF_COOKIE, "", { ...base(0), httpOnly: false }),
];
