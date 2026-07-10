import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthenticateInvestor } from "../../application/identity/authenticate-investor.js";
import { AuthenticateOfficer } from "../../application/identity/authenticate-officer.js";
import { Public } from "./auth.guard.js";

const credentials = (body: unknown): { email: string; password: string } => {
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.password !== "string") {
    throw new BadRequestException(`"email" and "password" are required strings`);
  }
  return { email: record.email, password: record.password };
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authenticateInvestor: AuthenticateInvestor,
    private readonly authenticateOfficer: AuthenticateOfficer,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown): Promise<{ token: string; investorId: string }> {
    return this.authenticateInvestor.execute(credentials(body));
  }

  @Public()
  @Post("officer/login")
  @HttpCode(200)
  officerLogin(@Body() body: unknown): Promise<{ token: string }> {
    return this.authenticateOfficer.execute(credentials(body));
  }
}
