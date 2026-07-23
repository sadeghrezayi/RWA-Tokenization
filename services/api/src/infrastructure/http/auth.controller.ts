import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthenticateInvestor } from "../../application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "../../application/identity/authenticate-officer.js";
import type { LoginThrottleService } from "../../application/identity/login-throttle-service.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, Public } from "./auth.guard.js";
import { AuthRateLimitGuard } from "./rate-limit.guard.js";
import { LOGIN_THROTTLE_SERVICE } from "./http.tokens.js";
import { newCsrfToken, sessionClearCookies, sessionSetCookies } from "./session.js";

// Minimal response surface so no framework type leaks past this file.
interface CookieResponse {
  setHeader(name: string, value: string | string[]): void;
}

const credentials = (body: unknown): { email: string; password: string } => {
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.password !== "string") {
    throw new BadRequestException(`"email" and "password" are required strings`);
  }
  return { email: record.email, password: record.password };
};

// Auth edge: every route is IP-rate-limited (guard); every login is wrapped in
// the per-account lockout throttle (T4). On success we establish an httpOnly
// session cookie + a readable CSRF cookie (T21). The token is also returned in
// the body for bearer/service clients; browsers ignore it and rely on cookies.
@Controller("auth")
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private readonly authenticateInvestor: AuthenticateInvestor,
    private readonly authenticateOfficer: AuthenticateOfficer,
    @Inject(LOGIN_THROTTLE_SERVICE) private readonly throttle: LoginThrottleService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ token: string; investorId: string; csrfToken: string }> {
    const creds = credentials(body);
    const result = await this.throttle.guard(creds.email, () =>
      this.authenticateInvestor.execute(creds),
    );
    const csrfToken = this.establishSession(res, result.token);
    return { ...result, csrfToken };
  }

  @Public()
  @Post("officer/login")
  @HttpCode(200)
  async officerLogin(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ token: string; csrfToken: string }> {
    const creds = credentials(body);
    const result = await this.throttle.guard(creds.email, () =>
      this.authenticateOfficer.execute(creds),
    );
    const csrfToken = this.establishSession(res, result.token);
    return { ...result, csrfToken };
  }

  // Lets a browser verify its cookie session on page load without exposing the
  // token to JS. Authenticated (cookie or bearer); returns the principal kind
  // so a portal shell can confirm the right role is signed in.
  @Get("session")
  session(@CurrentPrincipal() principal: Principal): { kind: Principal["kind"] } {
    return { kind: principal.kind };
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: CookieResponse): void {
    res.setHeader("Set-Cookie", sessionClearCookies());
  }

  private establishSession(res: CookieResponse, token: string): string {
    const csrfToken = newCsrfToken();
    res.setHeader("Set-Cookie", sessionSetCookies(token, csrfToken));
    return csrfToken;
  }
}
