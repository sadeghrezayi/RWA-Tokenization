import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApproveKyc } from "../../application/identity/approve-kyc.js";
import { GetInvestor } from "../../application/identity/get-investor.js";
import type { InvestorView } from "../../application/identity/get-investor.js";
import { ListPendingKyc } from "../../application/identity/list-pending-kyc.js";
import { RegisterInvestor } from "../../application/identity/register-investor.js";
import { RejectKyc } from "../../application/identity/reject-kyc.js";
import { StartKycReview } from "../../application/identity/start-kyc-review.js";
import { SubmitKyc } from "../../application/identity/submit-kyc.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, Public, RequireRole } from "./auth.guard.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

const investorIdOf = (principal: Principal): string => {
  // The guard enforces the role; this narrows the union for the type system.
  if (principal.kind !== "investor") throw new BadRequestException();
  return principal.investorId;
};

@Controller("investors")
export class InvestorsController {
  constructor(
    private readonly registerInvestor: RegisterInvestor,
    private readonly submitKyc: SubmitKyc,
    private readonly startKycReview: StartKycReview,
    private readonly approveKyc: ApproveKyc,
    private readonly rejectKyc: RejectKyc,
    private readonly getInvestor: GetInvestor,
    private readonly listPendingKyc: ListPendingKyc,
  ) {}

  @Public()
  @Post()
  register(@Body() body: unknown): Promise<{ investorId: string }> {
    return this.registerInvestor.execute({
      email: requireString(body, "email"),
      password: requireString(body, "password"),
    });
  }

  // --- investor self-service (bearer token, investor role) ---

  @RequireRole("investor")
  @Get("me")
  me(@CurrentPrincipal() principal: Principal): Promise<InvestorView> {
    return this.getInvestor.execute({ investorId: investorIdOf(principal) });
  }

  @RequireRole("investor")
  @Post("me/kyc/submit")
  @HttpCode(204)
  submitOwnKyc(@CurrentPrincipal() principal: Principal): Promise<void> {
    return this.submitKyc.execute({ investorId: investorIdOf(principal) });
  }

  // --- compliance-officer actions (FR-ID-4) ---

  @RequireRole("officer")
  @Get("pending-kyc")
  pendingKyc(): Promise<InvestorView[]> {
    return this.listPendingKyc.execute();
  }

  @RequireRole("officer")
  @Get(":id")
  get(@Param("id") id: string): Promise<InvestorView> {
    return this.getInvestor.execute({ investorId: id });
  }

  @RequireRole("officer")
  @Post(":id/kyc/start-review")
  @HttpCode(204)
  startReview(@Param("id") id: string): Promise<void> {
    return this.startKycReview.execute({ investorId: id });
  }

  @RequireRole("officer")
  @Post(":id/kyc/approve")
  @HttpCode(204)
  approve(@Param("id") id: string): Promise<void> {
    return this.approveKyc.execute({ investorId: id });
  }

  @RequireRole("officer")
  @Post(":id/kyc/reject")
  @HttpCode(204)
  reject(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    return this.rejectKyc.execute({ investorId: id, reason: requireString(body, "reason") });
  }
}
