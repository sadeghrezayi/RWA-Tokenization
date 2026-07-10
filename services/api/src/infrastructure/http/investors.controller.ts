import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApproveKyc } from "../../application/identity/approve-kyc.js";
import { GetInvestor } from "../../application/identity/get-investor.js";
import type { InvestorView } from "../../application/identity/get-investor.js";
import { RegisterInvestor } from "../../application/identity/register-investor.js";
import { RejectKyc } from "../../application/identity/reject-kyc.js";
import { StartKycReview } from "../../application/identity/start-kyc-review.js";
import { SubmitKyc } from "../../application/identity/submit-kyc.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
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
  ) {}

  @Post()
  register(@Body() body: unknown): Promise<{ investorId: string }> {
    return this.registerInvestor.execute({ email: requireString(body, "email") });
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<InvestorView> {
    return this.getInvestor.execute({ investorId: id });
  }

  @Post(":id/kyc/submit")
  @HttpCode(204)
  submit(@Param("id") id: string): Promise<void> {
    return this.submitKyc.execute({ investorId: id });
  }

  @Post(":id/kyc/start-review")
  @HttpCode(204)
  startReview(@Param("id") id: string): Promise<void> {
    return this.startKycReview.execute({ investorId: id });
  }

  @Post(":id/kyc/approve")
  @HttpCode(204)
  approve(@Param("id") id: string): Promise<void> {
    return this.approveKyc.execute({ investorId: id });
  }

  @Post(":id/kyc/reject")
  @HttpCode(204)
  reject(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    return this.rejectKyc.execute({ investorId: id, reason: requireString(body, "reason") });
  }
}
