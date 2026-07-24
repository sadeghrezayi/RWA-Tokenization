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
import { StartMfaEnrollment } from "../../application/identity/start-mfa-enrollment.js";
import { ConfirmMfaEnrollment } from "../../application/identity/confirm-mfa-enrollment.js";
import { DisableMfa } from "../../application/identity/disable-mfa.js";
import { GetMfaStatus } from "../../application/identity/get-mfa-status.js";
import { CompleteOfficerMfaChallenge } from "../../application/identity/complete-officer-mfa-challenge.js";
import { CurrentPrincipal, Public, RequireRole } from "./auth.guard.js";
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

// The @RequireRole("officer") guard guarantees the officer kind; this narrows
// the union for the type system and yields the MFA store key.
const officerIdOf = (principal: Principal): string => {
  if (principal.kind !== "officer") throw new BadRequestException();
  return principal.officerId;
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
    private readonly startMfaEnrollment: StartMfaEnrollment,
    private readonly confirmMfaEnrollment: ConfirmMfaEnrollment,
    private readonly disableMfa: DisableMfa,
    private readonly getMfaStatus: GetMfaStatus,
    private readonly completeOfficerMfa: CompleteOfficerMfaChallenge,
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

  // Officer login step 1 (password). Officers with active MFA get back
  // { mfaRequired: true, mfaToken } instead of a session — no cookie is set
  // until the MFA step (POST /auth/officer/mfa) succeeds (T4).
  @Public()
  @Post("officer/login")
  @HttpCode(200)
  async officerLogin(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ token: string; csrfToken: string } | { mfaRequired: true; mfaToken: string }> {
    const creds = credentials(body);
    const result = await this.throttle.guard(creds.email, () =>
      this.authenticateOfficer.execute(creds),
    );
    if (result.status === "mfa_required") {
      return { mfaRequired: true, mfaToken: result.challengeToken };
    }
    const csrfToken = this.establishSession(res, result.token);
    return { token: result.token, csrfToken };
  }

  // Officer login step 2: redeem the challenge + a TOTP or recovery code for a
  // session. Invalid/expired challenge or wrong code → 401.
  @Public()
  @Post("officer/mfa")
  @HttpCode(200)
  async officerMfa(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<{ token: string; csrfToken: string }> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.mfaToken !== "string" || typeof record.code !== "string") {
      throw new BadRequestException(`"mfaToken" and "code" are required strings`);
    }
    const { token } = await this.completeOfficerMfa.execute({
      challengeToken: record.mfaToken,
      code: record.code,
    });
    const csrfToken = this.establishSession(res, token);
    return { token, csrfToken };
  }

  // --- officer MFA management (authenticated officer) ---

  @RequireRole("officer")
  @Get("officer/mfa/status")
  officerMfaStatus(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ status: "none" | "pending" | "active" }> {
    return this.getMfaStatus.execute({ principalId: officerIdOf(principal) });
  }

  // Begin enrollment: returns the TOTP secret + otpauth URI to render as a QR.
  @RequireRole("officer")
  @Post("officer/mfa/enroll")
  @HttpCode(200)
  officerMfaEnroll(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ secret: string; keyUri: string }> {
    const officerId = officerIdOf(principal);
    return this.startMfaEnrollment.execute({ principalId: officerId, accountName: officerId });
  }

  // Confirm enrollment with a live code; returns single-use recovery codes once.
  @RequireRole("officer")
  @Post("officer/mfa/confirm")
  @HttpCode(200)
  officerMfaConfirm(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<{ recoveryCodes: string[] }> {
    const record = (body ?? {}) as Record<string, unknown>;
    if (typeof record.code !== "string") {
      throw new BadRequestException(`"code" is required`);
    }
    return this.confirmMfaEnrollment.execute({
      principalId: officerIdOf(principal),
      code: record.code,
    });
  }

  @RequireRole("officer")
  @Post("officer/mfa/disable")
  @HttpCode(204)
  async officerMfaDisable(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.disableMfa.execute({ principalId: officerIdOf(principal) });
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
