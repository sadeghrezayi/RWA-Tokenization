import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { parseCookies } from "./cookies.js";
import { CSRF_COOKIE, CSRF_HEADER } from "./session.js";
import type { AuthableRequest } from "./auth.guard.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface CsrfRequest extends AuthableRequest {
  method?: string;
}

// Double-submit CSRF (T21): a state-changing request authenticated via the
// session COOKIE must echo the CSRF cookie in the X-CSRF-Token header. Bearer
// auth is exempt (an attacker's site cannot set that header), and safe methods
// (GET/HEAD/OPTIONS) are exempt. Runs after AuthGuard, so authVia is set.
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CsrfRequest>();
    const method = (request.method ?? "GET").toUpperCase();
    if (request.authVia !== "cookie" || SAFE_METHODS.has(method)) {
      return true;
    }
    const cookieHeader = request.headers.cookie;
    const cookieToken = parseCookies(typeof cookieHeader === "string" ? cookieHeader : undefined)[
      CSRF_COOKIE
    ];
    const headerValue = request.headers[CSRF_HEADER];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (cookieToken === undefined || headerToken === undefined || headerToken !== cookieToken) {
      throw new ForbiddenException("missing or invalid CSRF token");
    }
    return true;
  }
}
