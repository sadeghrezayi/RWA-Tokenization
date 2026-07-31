import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  ChangeRequest,
  OnboardingStep,
} from "../../domain/onboarding/onboarding-application.js";
import { isOnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";
import type { Principal } from "../../application/identity/ports.js";
import { CompleteOnboardingStep } from "../../application/onboarding/complete-onboarding-step.js";
import { DownloadEvidence } from "../../application/onboarding/download-evidence.js";
import { GetOnboardingProgress } from "../../application/onboarding/get-onboarding-progress.js";
import { RemoveEvidence } from "../../application/onboarding/remove-evidence.js";
import { RequestOnboardingChanges } from "../../application/onboarding/request-onboarding-changes.js";
import { SaveStepAnswers } from "../../application/onboarding/save-step-answers.js";
import { GetStepAnswers } from "../../application/onboarding/get-step-answers.js";
import { ONBOARDING_FORM } from "../../application/onboarding/onboarding-form.js";
import type { OnboardingForm } from "../../application/onboarding/onboarding-form.js";
import { StartOnboarding } from "../../application/onboarding/start-onboarding.js";
import { SubmitOnboarding } from "../../application/onboarding/submit-onboarding.js";
import {
  MAX_EVIDENCE_BYTES,
  UploadEvidence,
} from "../../application/onboarding/upload-evidence.js";
import type { OnboardingProgressView } from "../../application/onboarding/onboarding-view.js";
import type { EvidenceDescriptor, StepAnswers } from "../../application/onboarding/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";

// The multer file shape, stated locally: @types/multer is not installed and a
// types-only dependency is not worth taking for four fields.
interface UploadedEvidenceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// A wizard that was never started is a normal state, not an error, so the shape
// says so explicitly instead of relying on an empty body.
interface OnboardingStatusResponse {
  started: boolean;
  application?: OnboardingProgressView;
}

interface EvidenceResponse {
  filename: string;
  contentType: string;
  contentBase64: string;
}

// What a reviewer sees: the answers plus the field definitions that produced
// them, so labels never have to be duplicated in the admin client.
interface AnswersResponse {
  form: OnboardingForm;
  answers: Partial<Record<OnboardingStep, StepAnswers>>;
}

const requireAnswers = (body: unknown): StepAnswers => {
  const raw = (body as { answers?: unknown } | null | undefined)?.answers;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BadRequestException('"answers" must be an object of field values');
  }
  const answers: StepAnswers = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new BadRequestException(`the answer to "${name}" must be text`);
    }
    answers[name] = value;
  }
  return answers;
};

const investorIdOf = (principal: Principal): string => {
  // The guard enforces the role; this narrows the union for the type system.
  if (principal.kind !== "investor") throw new BadRequestException();
  return principal.investorId;
};

const requireStep = (value: string): OnboardingStep => {
  if (!isOnboardingStep(value)) {
    throw new BadRequestException(`"${value}" is not an onboarding step`);
  }
  return value;
};

const requireChangeRequests = (body: unknown): ChangeRequest[] => {
  const raw = (body as { requests?: unknown } | null | undefined)?.requests;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException('"requests" must list at least one { step, reason }');
  }
  return raw.map((entry) => {
    const candidate = entry as { step?: unknown; reason?: unknown };
    if (typeof candidate.step !== "string" || typeof candidate.reason !== "string") {
      throw new BadRequestException('each request needs a "step" and a "reason"');
    }
    const reason = candidate.reason.trim();
    if (reason === "") {
      throw new BadRequestException("a change request must state a reason");
    }
    return { step: requireStep(candidate.step), reason };
  });
};

@Controller("onboarding")
export class OnboardingController {
  constructor(
    private readonly startOnboarding: StartOnboarding,
    private readonly getProgress: GetOnboardingProgress,
    private readonly completeStep: CompleteOnboardingStep,
    private readonly uploadEvidence: UploadEvidence,
    private readonly removeEvidence: RemoveEvidence,
    private readonly submitOnboarding: SubmitOnboarding,
    private readonly downloadEvidence: DownloadEvidence,
    private readonly requestChanges: RequestOnboardingChanges,
    private readonly saveAnswers: SaveStepAnswers,
    private readonly getAnswers: GetStepAnswers,
  ) {}

  // The field set is server-owned configuration (PROVISIONAL — see
  // onboarding-form.ts). The wizard renders whatever this returns, so changing
  // what an applicant must provide needs no client release.
  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("form")
  form(): OnboardingForm {
    return ONBOARDING_FORM;
  }

  // --- the applicant's own wizard ---

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("start")
  start(@CurrentPrincipal() principal: Principal): Promise<OnboardingProgressView> {
    return this.startOnboarding.execute({ investorId: investorIdOf(principal) });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me")
  async me(@CurrentPrincipal() principal: Principal): Promise<OnboardingStatusResponse> {
    const application = await this.getProgress.execute({
      investorId: investorIdOf(principal),
    });
    return application ? { started: true, application } : { started: false };
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me/steps/:step/complete")
  complete(
    @CurrentPrincipal() principal: Principal,
    @Param("step") step: string,
  ): Promise<OnboardingProgressView> {
    return this.completeStep.execute({
      investorId: investorIdOf(principal),
      step: requireStep(step),
    });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me/evidence")
  // The multer limit is a cheap first line of defence: an oversized upload is
  // rejected before it is buffered in full. The use case enforces the same
  // limit for callers that do not come through here.
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_BYTES } }))
  upload(
    @CurrentPrincipal() principal: Principal,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
    @Body() body: unknown,
  ): Promise<EvidenceDescriptor> {
    if (!file) {
      throw new BadRequestException('a "file" part is required');
    }
    const step = (body as { step?: unknown } | null | undefined)?.step;
    return this.uploadEvidence.execute({
      investorId: investorIdOf(principal),
      step: requireStep(typeof step === "string" ? step : "identity_evidence"),
      filename: file.originalname,
      contentType: file.mimetype,
      bytes: file.buffer,
    });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Delete("me/evidence/:reference")
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param("reference") reference: string,
  ): Promise<OnboardingProgressView> {
    return this.removeEvidence.execute({ investorId: investorIdOf(principal), reference });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me/evidence/:reference")
  mine(
    @CurrentPrincipal() principal: Principal,
    @Param("reference") reference: string,
  ): Promise<EvidenceResponse> {
    return this.toEvidenceResponse(reference, investorIdOf(principal));
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me/steps/:step/answers")
  answer(
    @CurrentPrincipal() principal: Principal,
    @Param("step") step: string,
    @Body() body: unknown,
  ): Promise<OnboardingProgressView> {
    return this.saveAnswers.execute({
      investorId: investorIdOf(principal),
      step: requireStep(step),
      answers: requireAnswers(body),
    });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me/answers")
  async myAnswers(@CurrentPrincipal() principal: Principal): Promise<AnswersResponse> {
    return {
      form: ONBOARDING_FORM,
      answers: await this.getAnswers.all({ investorId: investorIdOf(principal) }),
    };
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me/submit")
  submit(@CurrentPrincipal() principal: Principal): Promise<OnboardingProgressView> {
    return this.submitOnboarding.execute({ investorId: investorIdOf(principal) });
  }

  // --- the reviewing officer ---

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get("evidence/:reference")
  review(@Param("reference") reference: string): Promise<EvidenceResponse> {
    return this.toEvidenceResponse(reference);
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get(":investorId/answers")
  async applicantAnswers(@Param("investorId") investorId: string): Promise<AnswersResponse> {
    return { form: ONBOARDING_FORM, answers: await this.getAnswers.all({ investorId }) };
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Get(":investorId")
  async applicant(@Param("investorId") investorId: string): Promise<OnboardingStatusResponse> {
    const application = await this.getProgress.execute({ investorId });
    return application ? { started: true, application } : { started: false };
  }

  @RequirePermission(PERMISSIONS.KYC_REVIEW)
  @Post(":investorId/request-changes")
  sendBack(
    @Param("investorId") investorId: string,
    @Body() body: unknown,
  ): Promise<OnboardingProgressView> {
    return this.requestChanges.execute({
      investorId,
      requests: requireChangeRequests(body),
    });
  }

  // Base64 rather than a binary stream: the document is personal data that the
  // client renders inline, and this keeps the response inside the same
  // authenticated JSON path as everything else (no separate download URL that
  // could be shared or leak through a referrer).
  private async toEvidenceResponse(
    reference: string,
    investorId?: string,
  ): Promise<EvidenceResponse> {
    const content = await this.downloadEvidence.execute({
      reference,
      ...(investorId !== undefined ? { investorId } : {}),
    });
    return {
      filename: content.descriptor.filename,
      contentType: content.descriptor.contentType,
      contentBase64: content.bytes.toString("base64"),
    };
  }
}
