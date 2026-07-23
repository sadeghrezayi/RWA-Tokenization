// Dependency-free cookie parse/serialize for the httpOnly session model
// (T4/T21). Kept tiny and framework-agnostic; the controller writes Set-Cookie
// headers and guards read the request cookie header.
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAgeSeconds?: number;
}

export const parseCookies = (header: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (header === undefined || header === "") {
    return out;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "") {
      continue;
    }
    out[key] = decodeURIComponent(value);
  }
  return out;
};

export const serializeCookie = (name: string, value: string, options: CookieOptions): string => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${String(options.maxAgeSeconds)}`);
  }
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.sameSite !== undefined) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.httpOnly === true) {
    parts.push("HttpOnly");
  }
  if (options.secure === true) {
    parts.push("Secure");
  }
  return parts.join("; ");
};
