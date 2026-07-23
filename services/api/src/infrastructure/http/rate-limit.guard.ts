import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { TooManyRequestsError } from "../../application/identity/errors.js";
import { AUTH_RATE_LIMITER } from "./http.tokens.js";
import type { InMemoryRateLimiter } from "../auth/rate-limiter.js";

interface IpRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  path?: string;
}

// Edge rate limit for the auth routes: caps auth attempts per client IP per
// window regardless of which account is targeted (distributed brute force).
// Account-specific lockout is handled separately in LoginThrottleService.
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(@Inject(AUTH_RATE_LIMITER) private readonly limiter: InMemoryRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IpRequest>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const path = request.route?.path ?? request.path ?? "auth";
    const result = this.limiter.hit(`${ip}:${path}`);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
    return true;
  }
}
