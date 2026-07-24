import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CloseOffering } from "../../application/offerings/close-offering.js";
import { CreateOffering } from "../../application/offerings/create-offering.js";
import { GetOffering, ListOfferings } from "../../application/offerings/get-offering.js";
import type { OfferingView } from "../../application/offerings/get-offering.js";
import { OpenOffering } from "../../application/offerings/open-offering.js";
import { SubscribeToOffering } from "../../application/offerings/subscribe-to-offering.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

const field = (body: unknown, name: string): unknown =>
  (body as Record<string, unknown> | null | undefined)?.[name];

const requireBigInt = (body: unknown, name: string): bigint => {
  const raw = field(body, name);
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new BadRequestException(`"${name}" is required (integer as a string)`);
  }
  try {
    return BigInt(raw);
  } catch {
    throw new BadRequestException(`"${name}" must be an integer`);
  }
};

const requireIsoDate = (body: unknown, name: string): Date => {
  const raw = field(body, name);
  const date = typeof raw === "string" ? new Date(raw) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`"${name}" must be an ISO-8601 date string`);
  }
  return date;
};

const requireString = (body: unknown, name: string): string => {
  const raw = field(body, name);
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new BadRequestException(`"${name}" is required and must be a non-empty string`);
  }
  return raw;
};

@Controller("offerings")
export class OfferingsController {
  constructor(
    private readonly createOffering: CreateOffering,
    private readonly openOffering: OpenOffering,
    private readonly subscribeToOffering: SubscribeToOffering,
    private readonly closeOffering: CloseOffering,
    private readonly getOffering: GetOffering,
    private readonly listOfferings: ListOfferings,
  ) {}

  @Post()
  @RequirePermission(PERMISSIONS.OFFERING_MANAGE)
  create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ offeringId: string }> {
    return this.createOffering.execute({
      assetId: requireString(body, "assetId"),
      supply: requireBigInt(body, "supply"),
      priceRial: requireBigInt(body, "priceRial"),
      minPerInvestor: requireBigInt(body, "minPerInvestor"),
      maxPerInvestor: requireBigInt(body, "maxPerInvestor"),
      minimumRaise: requireBigInt(body, "minimumRaise"),
      opensAt: requireIsoDate(body, "opensAt"),
      closesAt: requireIsoDate(body, "closesAt"),
      actor: principal.kind === "officer" ? principal.officerId : principal.investorId,
    });
  }

  @Post(":id/open")
  @HttpCode(204)
  @RequirePermission(PERMISSIONS.OFFERING_MANAGE)
  open(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.openOffering.execute({
      offeringId: id,
      actor: principal.kind === "officer" ? principal.officerId : principal.investorId,
    });
  }

  @Post(":id/subscribe")
  @HttpCode(204)
  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  async subscribe(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    if (principal.kind !== "investor") {
      return; // unreachable — guard enforces the role
    }
    await this.subscribeToOffering.execute({
      offeringId: id,
      investorId: principal.investorId,
      tokens: requireBigInt(body, "tokens"),
    });
  }

  @Post(":id/close")
  @RequirePermission(PERMISSIONS.OFFERING_MANAGE)
  async close(
    @Param("id") id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ state: string; allocations: Record<string, string>[] }> {
    const result = await this.closeOffering.execute({
      offeringId: id,
      actor: principal.kind === "officer" ? principal.officerId : principal.investorId,
    });
    return {
      state: result.state,
      allocations: result.allocations.map((a) => ({
        investorId: a.investorId,
        requested: String(a.requested),
        allocated: String(a.allocated),
        costRial: String(a.costRial),
        refundRial: String(a.refundRial),
      })),
    };
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal): Promise<OfferingView[]> {
    return this.listOfferings.execute(
      principal.kind === "investor" ? { forInvestor: principal.investorId } : {},
    );
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<OfferingView> {
    return this.getOffering.execute({
      offeringId: id,
      ...(principal.kind === "investor" ? { forInvestor: principal.investorId } : {}),
    });
  }
}
