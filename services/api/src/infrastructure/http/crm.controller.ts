import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  AddCrmNote,
  AddInvestorTag,
  CompleteFollowUp,
  CreateFollowUp,
  ListOpenFollowUps,
  RemoveInvestorTag,
  SetRelationshipStage,
} from "../../application/crm/crm-use-cases.js";
import type { OpenFollowUpView } from "../../application/crm/crm-use-cases.js";
import type { RelationshipStage } from "../../domain/crm/crm-profile.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

const requireDate = (body: unknown, field: string): Date => {
  const date = new Date(requireString(body, field));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${field}" must be an ISO date`);
  }
  return date;
};

const officerIdOf = (principal: Principal): string =>
  principal.kind === "officer" ? principal.officerId : principal.investorId;

// CRM write surface (user-approved scope 2026-07-20). Officer-only; stage and
// content rules are enforced by the domain (invalid stage/blank note => 400).
@Controller("crm")
@RequirePermission(PERMISSIONS.CRM_MANAGE)
export class CrmController {
  constructor(
    private readonly setStage: SetRelationshipStage,
    private readonly addTag: AddInvestorTag,
    private readonly removeTag: RemoveInvestorTag,
    private readonly addNote: AddCrmNote,
    private readonly createFollowUp: CreateFollowUp,
    private readonly completeFollowUp: CompleteFollowUp,
    private readonly listOpenFollowUps: ListOpenFollowUps,
  ) {}

  @Get("follow-ups")
  openFollowUps(): Promise<OpenFollowUpView[]> {
    return this.listOpenFollowUps.execute();
  }

  @Post("follow-ups/:id/complete")
  @HttpCode(204)
  complete(@Param("id") id: string): Promise<void> {
    return this.completeFollowUp.execute({ followUpId: id });
  }

  @Put(":investorId/stage")
  @HttpCode(204)
  stage(@Param("investorId") investorId: string, @Body() body: unknown): Promise<void> {
    return this.setStage.execute({
      investorId,
      stage: requireString(body, "stage") as RelationshipStage,
    });
  }

  @Post(":investorId/tags")
  @HttpCode(204)
  tag(@Param("investorId") investorId: string, @Body() body: unknown): Promise<void> {
    return this.addTag.execute({ investorId, tag: requireString(body, "tag") });
  }

  @Delete(":investorId/tags/:tag")
  @HttpCode(204)
  untag(@Param("investorId") investorId: string, @Param("tag") tag: string): Promise<void> {
    return this.removeTag.execute({ investorId, tag });
  }

  @Post(":investorId/notes")
  note(
    @Param("investorId") investorId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ noteId: string }> {
    return this.addNote.execute({
      investorId,
      authorId: officerIdOf(principal),
      text: requireString(body, "text"),
    });
  }

  @Post(":investorId/follow-ups")
  followUp(
    @Param("investorId") investorId: string,
    @Body() body: unknown,
  ): Promise<{ followUpId: string }> {
    return this.createFollowUp.execute({
      investorId,
      text: requireString(body, "text"),
      dueAt: requireDate(body, "dueAt"),
    });
  }
}
