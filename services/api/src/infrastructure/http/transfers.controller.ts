import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { TransferTokens } from "../../application/transfers/transfer-tokens.js";
import { ListTransfers } from "../../application/transfers/get-transfers.js";
import type { TransferView } from "../../application/transfers/get-transfers.js";
import { GetMyHoldings } from "../../application/transfers/get-holdings.js";
import type { HoldingView } from "../../application/transfers/get-holdings.js";
import { ResolveInvestorByEmail } from "../../application/identity/resolve-investor-by-email.js";
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

// FR-TR-1: a verified holder transfers tokens to another verified holder,
// addressed by email (P2 — no UUIDs in the user's hands).
@Controller("transfers")
@RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
export class TransfersController {
  constructor(
    private readonly transferTokens: TransferTokens,
    private readonly listTransfers: ListTransfers,
    private readonly resolveByEmail: ResolveInvestorByEmail,
    private readonly getMyHoldings: GetMyHoldings,
  ) {}

  @Get("holdings")
  holdings(@CurrentPrincipal() principal: Principal): Promise<HoldingView[]> {
    const investorId = principal.kind === "investor" ? principal.investorId : "";
    return this.getMyHoldings.execute({ investorId });
  }

  @Post()
  async transfer(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ transferId: string }> {
    if (principal.kind !== "investor") {
      throw new BadRequestException("only investors can transfer");
    }
    const { investorId: toInvestorId } = await this.resolveByEmail.execute({
      email: requireString(body, "toEmail"),
    });
    return this.transferTokens.execute({
      assetId: requireString(body, "assetId"),
      fromInvestorId: principal.investorId,
      toInvestorId,
      tokens: requireBigInt(body, "tokens"),
    });
  }

  @Get("me")
  mine(@CurrentPrincipal() principal: Principal): Promise<TransferView[]> {
    const investorId = principal.kind === "investor" ? principal.investorId : "";
    return this.listTransfers.executeForInvestor({ investorId });
  }
}
