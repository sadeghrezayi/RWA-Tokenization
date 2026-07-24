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
import { RequestPasswordReset } from "../../application/identity/request-password-reset.js";
import { ResetPassword } from "../../application/identity/reset-password.js";
import { RequestEmailVerification } from "../../application/identity/request-email-verification.js";
import { VerifyEmail } from "../../application/identity/verify-email.js";
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
    private readonly requestPasswordReset: RequestPasswordReset,
    private readonly resetPassword: ResetPassword,
    private readonly requestEmailVerification: RequestEmailVerification,
    private readonly verifyEmail: VerifyEmail,
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

  // T4 self-service reset — request half. Always 202, never revealing whether
  // the address is registered (no account enumeration). IP-rate-limited by the
  // class guard so it can't be used to blast reset emails.
  @Public()
  @Post("password-reset/request")
  @HttpCode(202)
  async passwordResetRequest(@Body() body: unknown): Promise<{ status: "accepted" }> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.email !== "string") {
      throw new BadRequestException(`"email" is required`);
    }
    await this.requestPasswordReset.execute({ email: record.email });
    return { status: "accepted" };
  }

  // T4 self-service reset — redemption half. Consumes a single-use token and
  // rotates the credential; invalid/expired token → 400, weak password → 400.
  @Public()
  @Post("password-reset")
  @HttpCode(204)
  async passwordResetConfirm(@Body() body: unknown): Promise<void> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.token !== "string" || typeof record.password !== "string") {
      throw new BadRequestException(`"token" and "password" are required strings`);
    }
    await this.resetPassword.execute({ token: record.token, password: record.password });
  }

  // T4 email verification — request half (also used for "resend"). Always 202;
  // no-op for an unknown or already-verified address (no enumeration).
  @Public()
  @Post("email-verification/request")
  @HttpCode(202)
  async emailVerificationRequest(@Body() body: unknown): Promise<{ status: "accepted" }> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.email !== "string") {
      throw new BadRequestException(`"email" is required`);
    }
    await this.requestEmailVerification.execute({ email: record.email });
    return { status: "accepted" };
  }

  // T4 email verification — redemption half. Consumes a single-use token and
  // marks the email verified; invalid/expired token → 400.
  @Public()
  @Post("verify-email")
  @HttpCode(204)
  async emailVerificationConfirm(@Body() body: unknown): Promise<void> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.token !== "string") {
      throw new BadRequestException(`"token" is required`);
    }
    await this.verifyEmail.execute({ token: record.token });
  }

  private establishSession(res: CookieResponse, token: string): string {
    const csrfToken = newCsrfToken();
    res.setHeader("Set-Cookie", sessionSetCookies(token, csrfToken));
    return csrfToken;
  }
}
