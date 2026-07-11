import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { Principal } from "../../application/identity/ports.js";
import { PrismaSettlementRail } from "../settlement/prisma-settlement-rail.js";
import { CurrentPrincipal, RequireRole } from "./auth.guard.js";

// D3 pilot rail: the operator records bank deposits by crediting the ledger;
// investors read their own balance. Real bank integration replaces the credit
// endpoint behind the same SettlementRail.
@Controller("ledger")
export class LedgerController {
  constructor(private readonly rail: PrismaSettlementRail) {}

  @Post(":investorId/credit")
  @HttpCode(204)
  @RequireRole("officer")
  async credit(
    @Param("investorId") investorId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    const raw = (body as Record<string, unknown> | null | undefined)?.amountRial;
    if (typeof raw !== "string" && typeof raw !== "number") {
      throw new BadRequestException(`"amountRial" is required (integer as a string)`);
    }
    let amount: bigint;
    try {
      amount = BigInt(raw);
    } catch {
      throw new BadRequestException(`"amountRial" must be an integer`);
    }
    if (amount <= 0n) {
      throw new BadRequestException(`"amountRial" must be positive`);
    }
    await this.rail.credit(
      investorId,
      amount,
      principal.kind === "officer" ? principal.officerId : principal.investorId,
    );
  }

  @Get("me")
  @RequireRole("investor")
  async me(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ balanceRial: string; heldRial: string }> {
    const investorId = principal.kind === "investor" ? principal.investorId : "";
    const { balanceRial, heldRial } = await this.rail.balanceOf(investorId);
    return { balanceRial: String(balanceRial), heldRial: String(heldRial) };
  }
}
