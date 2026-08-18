import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { TooManyRequestsError } from "../../application/identity/errors.js";
import { AUTH_RATE_LIMITER, AUTH_READ_RATE_LIMITER } from "./http.tokens.js";
import type { InMemoryRateLimiter } from "../auth/rate-limiter.js";

interface IpRequest {
  ip?: string;
  method?: string;
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  path?: string;
}

// Edge rate limit for the auth routes: caps auth attempts per client IP per
// window regardless of which account is targeted (distributed brute force).
// Account-specific lockout is handled separately in LoginThrottleService.
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    @Inject(AUTH_RATE_LIMITER) private readonly limiter: InMemoryRateLimiter,
    @Inject(AUTH_READ_RATE_LIMITER) private readonly reads: InMemoryRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IpRequest>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const path = request.route?.path ?? request.path ?? "auth";
    // This limiter exists to stop credential GUESSING. A safe read guesses
    // nothing — and `GET /auth/session` is asked on every page load of every
    // portal, so counting it as an attempt locked signed-in people out of
    // their own accounts for the crime of browsing. Worse behind a shared
    // address, where one budget covers everyone (K-27). Reads still have a
    // ceiling; it is a ceiling for reading, not for guessing.
    const limiter = request.method === "GET" ? this.reads : this.limiter;
    const result = limiter.hit(`${ip}:${path}`);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
    return true;
  }
}
