import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { DeclareDistribution } from "../../application/distributions/declare-distribution.js";
import {
  GetDistribution,
  ListDistributions,
} from "../../application/distributions/get-distribution.js";
import type { DistributionView } from "../../application/distributions/get-distribution.js";
import { RequestDistributionPayout } from "../../application/distributions/request-distribution-payout.js";
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

// FR-YD endpoints — operator-only (declare income, review reconciliation, pay).
@Controller("distributions")
@RequirePermission(PERMISSIONS.DISTRIBUTION_MANAGE)
export class DistributionsController {
  constructor(
    private readonly declareDistribution: DeclareDistribution,
    private readonly requestPayout: RequestDistributionPayout,
    private readonly getDistribution: GetDistribution,
    private readonly listDistributions: ListDistributions,
  ) {}

  @Post()
  declare(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ distributionId: string }> {
    return this.declareDistribution.execute({
      assetId: requireString(body, "assetId"),
      totalAmountRial: requireBigInt(body, "totalAmountRial"),
      actor: actorOf(principal),
    });
  }

  // 4.1 / threat model T3: a payout credits every holder of an asset at once,
  // so it no longer happens on one person's say-so. This PARKS the request; a
  // second officer decides it in the approvals queue, and the money moves in
  // the same transaction as that decision.
  //
  // The route keeps its name because what the officer is doing has not changed
  // — they are still paying the distribution. What changed is that it now takes
  // two of them, which the response says.
  @Post(":id/pay")
  async pay(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ status: string; approvalId: string }> {
    return this.requestPayout.execute({ distributionId: id, makerId: actorOf(principal) });
  }

  @Get()
  list(): Promise<DistributionView[]> {
    return this.listDistributions.execute();
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<DistributionView> {
    return this.getDistribution.execute({ distributionId: id });
  }
}
