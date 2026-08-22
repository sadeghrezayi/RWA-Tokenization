import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
} from "@nestjs/common";
import { ApproveKyc } from "../../application/identity/approve-kyc.js";
import { ReissueKycClaim } from "../../application/identity/reissue-kyc-claim.js";
import { ScreenInvestor } from "../../application/screening/screen-investor.js";
import { AssessRisk } from "../../application/risk/assess-risk.js";
import { RISK_MODEL } from "../../application/risk/risk-model.js";
import type { RiskModel } from "../../application/risk/risk-model.js";
import { ListRiskAssessments, toRiskAssessmentView } from "../../application/risk/risk-views.js";
import type { RiskAssessmentView } from "../../application/risk/risk-views.js";
import { ListDueReviews } from "../../application/risk/list-due-reviews.js";
import type { DueReviewView } from "../../application/risk/list-due-reviews.js";
import { REVIEW_CADENCE } from "../../application/risk/risk-model.js";
import type { ReviewCadence } from "../../application/risk/risk-model.js";
import { ListScreenings, toScreeningView } from "../../application/screening/screening-views.js";
import type { ScreeningView } from "../../application/screening/screening-views.js";
import { GetInvestor } from "../../application/identity/get-investor.js";
import type { InvestorView } from "../../application/identity/get-investor.js";
import { GetInvestorDetail, ListInvestors } from "../../application/identity/investor-directory.js";
import type {
  InvestorDetailView,
  InvestorDirectoryView,
} from "../../application/identity/investor-directory.js";
import { ListPendingKyc } from "../../application/identity/list-pending-kyc.js";
import { RegisterInvestor } from "../../application/identity/register-investor.js";
import { RequestEmailVerification } from "../../application/identity/request-email-verification.js";
import { RejectKyc } from "../../application/identity/reject-kyc.js";
import { StartKycReview } from "../../application/identity/start-kyc-review.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, Public, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

// The @RequirePermission(kyc.review) guard guarantees the officer kind; this
// narrows the union so a rating is always attributed to a real person.
const officerIdOf = (principal: Principal): string => {
  if (principal.kind !== "officer") {
    throw new BadRequestException("only a reviewing officer can rate an applicant");
  }
  return principal.officerId;
};

// Answers arrive as { factorId: answer }. Anything that is not a string pair is
// refused outright rather than coerced — a coerced answer is an invented one.
const requireAnswers = (body: unknown): Record<string, string> => {
  const given = (body as Record<string, unknown> | null | undefined)?.answers;
  if (typeof given !== "object" || given === null || Array.isArray(given)) {
    throw new BadRequestException(`"answers" is required and must be an object`);
  }
  const answers: Record<string, string> = {};
  for (const [factorId, answer] of Object.entries(given as Record<string, unknown>)) {
    if (typeof answer !== "string") {
      throw new BadRequestException(`answer for "${factorId}" must be a string`);
    }
    answers[factorId] = answer;
  }
  return answers;
};

const investorIdOf = (principal: Principal): string => {
  // The guard enforces the role; this narrows the union for the type system.
  if (principal.kind !== "investor") throw new BadRequestException();
  return principal.investorId;
};

@Controller("investors")
export class InvestorsController {
  private readonly log = new Logger(InvestorsController.name);

  constructor(
    private readonly registerInvestor: RegisterInvestor,
    private readonly startKycReview: StartKycReview,
    private readonly approveKyc: ApproveKyc,
    private readonly reissueKycClaim: ReissueKycClaim,
    private readonly screenInvestor: ScreenInvestor,
    private readonly listScreenings: ListScreenings,
    private readonly assessRisk: AssessRisk,
    private readonly listRiskAssessments: ListRiskAssessments,
    private readonly listDueReviews: ListDueReviews,
    private readonly rejectKyc: RejectKyc,
    private readonly getInvestor: GetInvestor,
    private readonly listPendingKyc: ListPendingKyc,
    private readonly listInvestors: ListInvestors,
    private readonly getInvestorDetail: GetInvestorDetail,
    private readonly requestEmailVerification: RequestEmailVerification,
  ) {}

  @Public()
  @Post()
  async register(@Body() body: unknown): Promise<{ investorId: string }> {
    const email = requireString(body, "email");
    const result = await this.registerInvestor.execute({
      email,
      password: requireString(body, "password"),
    });
    // Send the first verification email best-effort: a transport failure must
    // not fail an otherwise-successful signup (the user can resend). T4.
    await this.requestEmailVerification.execute({ email }).catch((error: unknown) => {
      this.log.warn(`could not send verification email on registration: ${String(error)}`);
    });
    return result;
  }

  // --- investor self-service (bearer token, investor role) ---

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me")
  me(@CurrentPrincipal() principal: Principal): Promise<InvestorView> {
    return this.getInvestor.execute({ investorId: investorIdOf(principal) });
  }

  // --- compliance-officer actions (FR-ID-4) ---

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get("pending-kyc")
  pendingKyc(): Promise<InvestorView[]> {
    return this.listPendingKyc.execute();
  }

  // FR-PT-3 user management: the full directory and the per-user drill-down.

  @RequirePermission(PERMISSIONS.INVESTOR_READ)
  @Get()
  list(): Promise<InvestorDirectoryView> {
    return this.listInvestors.execute();
  }

  @RequirePermission(PERMISSIONS.INVESTOR_READ)
  @Get(":id/detail")
  detail(@Param("id") id: string): Promise<InvestorDetailView> {
    return this.getInvestorDetail.execute({ investorId: id });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_READ)
  @Get(":id")
  get(@Param("id") id: string): Promise<InvestorView> {
    return this.getInvestor.execute({ investorId: id });
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/kyc/start-review")
  @HttpCode(204)
  startReview(@Param("id") id: string): Promise<void> {
    return this.startKycReview.execute({ investorId: id });
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/kyc/approve")
  @HttpCode(204)
  approve(@Param("id") id: string): Promise<void> {
    return this.approveKyc.execute({ investorId: id });
  }

  // 4.2: run a sanctions/PEP check. Same permission as the other KYC review
  // actions — screening is part of reviewing an applicant, not a separate power.
  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/screenings")
  async screen(@Param("id") id: string): Promise<ScreeningView> {
    return toScreeningView(await this.screenInvestor.execute({ investorId: id }));
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get(":id/screenings")
  screenings(@Param("id") id: string): Promise<ScreeningView[]> {
    return this.listScreenings.execute({ investorId: id });
  }

  // 4.2: rate an applicant against the configured risk model. The answers come
  // from the officer; the POINTS never do — they are read from the model
  // server-side, so nobody able to reach this endpoint can move a band without
  // it being visible in the model everyone else is scored against.
  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/risk-assessments")
  async assessRiskFor(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<RiskAssessmentView> {
    return toRiskAssessmentView(
      await this.assessRisk.execute({
        subjectId: id,
        answers: requireAnswers(body),
        // Attributed to the signed-in officer, never to anything the client
        // sent: a risk judgement someone else could sign for is not reviewable.
        assessedBy: officerIdOf(principal),
      }),
    );
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get(":id/risk-assessments")
  riskAssessments(@Param("id") id: string): Promise<RiskAssessmentView[]> {
    return this.listRiskAssessments.execute({ subjectId: id });
  }

  // 4.2: approved customers whose periodic review is due, worst first. A work
  // list, NOT an enforcement mechanism — a lapsed review restricts nobody.
  //
  // Deliberately its OWN list rather than a fourth item in the ops work queue:
  // the queue's contents (pending KYC, approvals, redemptions) were settled as
  // a product decision, and quietly widening them is not mine to make.
  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get("reviews/due")
  dueReviews(): Promise<DueReviewView[]> {
    return this.listDueReviews.execute();
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get("reviews/cadence")
  reviewCadence(): ReviewCadence {
    return REVIEW_CADENCE;
  }

  // The model itself, so the officer's form renders exactly what the server
  // scores — one definition, no second copy in the web app to drift from it.
  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get("risk-model/current")
  riskModel(): RiskModel {
    return RISK_MODEL;
  }

  // K-2: recovery, not a decision. An approval whose on-chain claim failed
  // leaves an investor approved and unable to hold anything; this is the only
  // way back, short of editing the database.
  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/kyc/reissue-claim")
  @HttpCode(204)
  reissueClaim(@Param("id") id: string): Promise<void> {
    return this.reissueKycClaim.execute({ investorId: id });
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":id/kyc/reject")
  @HttpCode(204)
  reject(@Param("id") id: string, @Body() body: unknown): Promise<void> {
    return this.rejectKyc.execute({ investorId: id, reason: requireString(body, "reason") });
  }
}
