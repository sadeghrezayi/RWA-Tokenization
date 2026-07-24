import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { RequestRedemption } from "../../application/redemptions/request-redemption.js";
import { FulfillRedemption } from "../../application/redemptions/fulfill-redemption.js";
import { RejectRedemption } from "../../application/redemptions/reject-redemption.js";
import { ListRedemptions } from "../../application/redemptions/get-redemptions.js";
import type { RedemptionView } from "../../application/redemptions/get-redemptions.js";
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

const requireBigInt = (body: unknown, field: string): bigint => {
  const raw = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new BadRequestException(`"${field}" is required (integer as a string)`);
  }
  try {
    return BigInt(raw);
  } catch {
    throw new BadRequestException(`"${field}" must be an integer`);
  }
};

const actorOf = (principal: Principal): string =>
  principal.kind === "officer" ? principal.officerId : principal.investorId;

// FR-TR-2: investors request; the operator reviews, then fulfills (burn +
// payout at attested value) or rejects with a reason.
@Controller("redemptions")
export class RedemptionsController {
  constructor(
    private readonly requestRedemption: RequestRedemption,
    private readonly fulfillRedemption: FulfillRedemption,
    private readonly rejectRedemption: RejectRedemption,
    private readonly listRedemptions: ListRedemptions,
  ) {}

  @Post()
  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  request(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ redemptionId: string }> {
    if (principal.kind !== "investor") {
      throw new BadRequestException("only investors can request redemption");
    }
    return this.requestRedemption.execute({
      assetId: requireString(body, "assetId"),
      investorId: principal.investorId,
      tokens: requireBigInt(body, "tokens"),
    });
  }

  @Get("me")
  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  mine(@CurrentPrincipal() principal: Principal): Promise<RedemptionView[]> {
    const investorId = principal.kind === "investor" ? principal.investorId : "";
    return this.listRedemptions.executeForInvestor({ investorId });
  }

  @Get()
  @RequirePermission(PERMISSIONS.REDEMPTION_MANAGE)
  all(): Promise<RedemptionView[]> {
    return this.listRedemptions.executeAll();
  }

  @Post(":id/fulfill")
  @RequirePermission(PERMISSIONS.REDEMPTION_MANAGE)
  fulfill(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ payoutRial: string }> {
    return this.fulfillRedemption.execute({ redemptionId: id, actor: actorOf(principal) });
  }

  @Post(":id/reject")
  @HttpCode(204)
  @RequirePermission(PERMISSIONS.REDEMPTION_MANAGE)
  async reject(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    await this.rejectRedemption.execute({
      redemptionId: id,
      reason: requireString(body, "reason"),
      actor: actorOf(principal),
    });
  }
}
