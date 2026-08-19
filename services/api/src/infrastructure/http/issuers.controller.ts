import { asDocumentKind } from "./dossier-kind.js";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import { AddTeamMember } from "../../application/issuers/add-team-member.js";
import { RemoveTeamMember } from "../../application/issuers/remove-team-member.js";
import { ApplyAsIssuer } from "../../application/issuers/apply-as-issuer.js";
import { DecideIssuerApplication } from "../../application/issuers/decide-issuer-application.js";
import { IssuerTeamAccess } from "../../application/issuers/issuer-team-access.js";
import {
  GetIssuer,
  ListIssuerTeam,
  ListIssuers,
  ListMyIssuerOrganisations,
} from "../../application/issuers/issuer-views.js";
import type {
  IssuerMemberView,
  IssuerOrganisationView,
  MyIssuerOrganisationView,
} from "../../application/issuers/issuer-views.js";
import { ListIssuerAssets } from "../../application/assets/get-asset.js";
import { ProposeAsset } from "../../application/assets/propose-asset.js";
import { AttachIssuerDocument } from "../../application/assets/attach-issuer-document.js";
import type { AssetView } from "../../application/assets/get-asset.js";
import { ISSUER_ROLES } from "../../domain/issuers/issuer-membership.js";
import type { IssuerRole } from "../../domain/issuers/issuer-membership.js";
import { PERMISSIONS, principalHasPermission } from "../../application/identity/authorization.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";

const requireString = (body: unknown, field: string): string => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`"${field}" is required and must be a non-empty string`);
  }
  return value;
};

const asIssuerRole = (raw: string): IssuerRole => {
  if (!(ISSUER_ROLES as readonly string[]).includes(raw)) {
    throw new BadRequestException(`"role" must be one of: ${ISSUER_ROLES.join(", ")}`);
  }
  return raw as IssuerRole;
};

const actorOf = (principal: Principal): string =>
  principal.kind === "officer" ? principal.officerId : principal.investorId;

// 3.2e. Two audiences meet here, and they are authorized differently:
//
//   • the platform's staff, by permission (reviewing and deciding applications);
//   • an issuer's own people, by MEMBERSHIP — which no platform-wide permission
//     can express, so those routes check the organisation itself.
//
// Applying is open to any authenticated user, and refused unless they have
// completed individual verification. That refusal is the user's rule of
// 2026-08-15 reaching the outside world: this controller is the first place a
// person can actually meet it.
@Controller("issuers")
export class IssuersController {
  constructor(
    private readonly applyAsIssuer: ApplyAsIssuer,
    private readonly decide: DecideIssuerApplication,
    private readonly addTeamMember: AddTeamMember,
    private readonly removeTeamMember: RemoveTeamMember,
    private readonly listIssuers: ListIssuers,
    private readonly getIssuer: GetIssuer,
    private readonly listTeam: ListIssuerTeam,
    private readonly listMine: ListMyIssuerOrganisations,
    private readonly listIssuerAssets: ListIssuerAssets,
    private readonly proposeAsset: ProposeAsset,
    private readonly attachIssuerDocument: AttachIssuerDocument,
    private readonly access: IssuerTeamAccess,
  ) {}

  @Post()
  apply(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ organisationId: string }> {
    return this.applyAsIssuer.execute({
      applicantUserId: actorOf(principal),
      legalName: requireString(body, "legalName"),
      registrationNumber: requireString(body, "registrationNumber"),
      contactEmail: requireString(body, "contactEmail"),
    });
  }

  @Get()
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  list(): Promise<IssuerOrganisationView[]> {
    return this.listIssuers.execute();
  }

  // 3.3d: the issuer portal's first question. Declared BEFORE `:id`, because
  // Nest matches in declaration order and would otherwise read "mine" as an
  // organisation id — which fails as a 403, not as a 404, so it would look
  // like a permission bug rather than a routing one.
  //
  // No permission decorator: this is a person asking about themselves. Someone
  // who acts for no issuer gets an empty list, which is the true answer.
  @Get("mine")
  mine(@CurrentPrincipal() principal: Principal): Promise<MyIssuerOrganisationView[]> {
    return this.listMine.execute({ userId: actorOf(principal) });
  }

  // One organisation's own record. Staff read any; an issuer's people read
  // theirs — the same rule as their team, since the two are read together.
  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<IssuerOrganisationView> {
    await this.authorize(id, principal, "read");
    return this.getIssuer.execute({ organisationId: id });
  }

  @Post(":id/start-review")
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  @HttpCode(204)
  startReview(@Param("id") id: string): Promise<void> {
    return this.decide.startReview({ organisationId: id });
  }

  @Post(":id/approve")
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  @HttpCode(204)
  approve(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.decide.approve({ organisationId: id, officerId: actorOf(principal) });
  }

  @Post(":id/reject")
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  @HttpCode(204)
  reject(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.decide.reject({
      organisationId: id,
      officerId: actorOf(principal),
      reason: requireString(body, "reason"),
    });
  }

  @Post(":id/suspend")
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  @HttpCode(204)
  suspend(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.decide.suspend({
      organisationId: id,
      officerId: actorOf(principal),
      reason: requireString(body, "reason"),
    });
  }

  @Post(":id/reinstate")
  @RequirePermission(PERMISSIONS.ISSUER_MANAGE)
  @HttpCode(204)
  reinstate(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.decide.reinstate({ organisationId: id, officerId: actorOf(principal) });
  }

  @Get(":id/members")
  async members(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<IssuerMemberView[]> {
    await this.authorize(id, principal, "read");
    return this.listTeam.execute({ organisationId: id });
  }

  // 3.3f: the assets this organisation brought. Same authorisation as its team
  // — staff read any, an issuer's own people read theirs — because "what are we
  // preparing" is exactly as confidential as "who works here".
  @Get(":id/assets")
  async assets(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<AssetView[]> {
    await this.authorize(id, principal, "read");
    return this.listIssuerAssets.execute({ organisationId: id });
  }

  // 3.3h: the issuer brings its own asset. Delegates to the SAME use case the
  // admin console calls, so "what proposing an asset means" — including the
  // organisation-level gate that refuses an issuer who may not submit yet —
  // has one definition. What is new here is the per-person check: this is
  // where IssuerMembership.canWorkOnAssets() finally decides something.
  @Post(":id/assets")
  async bringAsset(
    @Param("id") id: string,
    @Body() body: { name?: unknown },
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ assetId: string }> {
    await this.authorize(id, principal, "assets");
    return this.proposeAsset.execute({
      name: typeof body.name === "string" ? body.name : "",
      actor: actorOf(principal),
      organisationId: id,
    });
  }

  // 3.3i: the issuer files its own dossier. TWO gates, and both are needed:
  // `authorize` says this person acts for this organisation, and the use case
  // says this organisation brought this asset. Membership alone would let an
  // issuer file documents against a rival's asset by naming their own id.
  @Post(":id/assets/:assetId/documents")
  async attachAssetDocument(
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ cid: string; sha256: string }> {
    await this.authorize(id, principal, "assets");
    return this.attachIssuerDocument.execute({
      organisationId: id,
      assetId,
      kind: asDocumentKind(requireString(body, "kind")),
      title: requireString(body, "title"),
      contentBase64: requireString(body, "contentBase64"),
      actor: actorOf(principal),
    });
  }

  // Invitations are by email, because that is how a colleague is known. The
  // person must already hold a verified platform account.
  @Post(":id/members")
  @HttpCode(204)
  async addMember(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    await this.authorize(id, principal, "manage");
    await this.addTeamMember.execute({
      organisationId: id,
      email: requireString(body, "email"),
      role: asIssuerRole(requireString(body, "role")),
    });
  }

  // The counterpart of the invitation: someone who has left must stop acting
  // for the issuer. Refused when it would leave the organisation with no admin.
  @Delete(":id/members/:userId")
  @HttpCode(204)
  async removeMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    await this.authorize(id, principal, "manage");
    await this.removeTeamMember.execute({ organisationId: id, userId });
  }

  // Staff pass on their permission; everyone else must be a person of THIS
  // organisation — an admin to staff it, any member to read it.
  private async authorize(
    organisationId: string,
    principal: Principal,
    need: "read" | "manage" | "assets",
  ): Promise<void> {
    if (principalHasPermission(principal, PERMISSIONS.ISSUER_MANAGE)) {
      return;
    }
    const userId = actorOf(principal);
    if (need === "manage") {
      await this.access.assertCanManageTeam({ organisationId, userId });
      return;
    }
    if (need === "assets") {
      await this.access.assertCanWorkOnAssets({ organisationId, userId });
      return;
    }
    await this.access.assertMember({ organisationId, userId });
  }
}
