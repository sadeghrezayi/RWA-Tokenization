import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthenticateInvestor } from "../../application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "../../application/identity/authenticate-officer.js";
import type { LoginThrottleService } from "../../application/identity/login-throttle-service.js";
import { Public } from "./auth.guard.js";
import { AuthRateLimitGuard } from "./rate-limit.guard.js";
import { LOGIN_THROTTLE_SERVICE } from "./http.tokens.js";

const credentials = (body: unknown): { email: string; password: string } => {
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.password !== "string") {
    throw new BadRequestException(`"email" and "password" are required strings`);
  }
  return { email: record.email, password: record.password };
};

// Auth edge: every route is IP-rate-limited (guard) and every login is wrapped
// in the per-account lockout throttle (T4). Officer and investor logins share
// one throttle keyed by email so an attacker cannot bypass by picking a role.
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
  login(@Body() body: unknown): Promise<{ token: string; investorId: string }> {
    const creds = credentials(body);
    return this.throttle.guard(creds.email, () => this.authenticateInvestor.execute(creds));
  }

  @Public()
  @Post("officer/login")
  @HttpCode(200)
  officerLogin(@Body() body: unknown): Promise<{ token: string }> {
    const creds = credentials(body);
    return this.throttle.guard(creds.email, () => this.authenticateOfficer.execute(creds));
  }
}
