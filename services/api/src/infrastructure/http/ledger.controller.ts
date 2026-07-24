import { BadRequestException, Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { CreditInvestorLedger } from "../../application/approvals/credit-investor-ledger.js";
import type { Principal } from "../../application/identity/ports.js";
import { PrismaSettlementRail } from "../settlement/prisma-settlement-rail.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

// Minimal response surface so no framework type leaks past this file.
interface StatusResponse {
  status(code: number): void;
}

// D3 pilot rail: the operator records bank deposits by crediting the ledger;
// investors read their own balance. Real bank integration replaces the credit
// endpoint behind the same SettlementRail. A credit at/above the approval
// threshold is parked for maker-checker approval instead of applied (T1/T3).
@Controller("ledger")
export class LedgerController {
  constructor(
    private readonly rail: PrismaSettlementRail,
    private readonly creditInvestorLedger: CreditInvestorLedger,
  ) {}

  @Post(":investorId/credit")
  @RequirePermission(PERMISSIONS.LEDGER_CREDIT)
  async credit(
    @Param("investorId") investorId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) res: StatusResponse,
  ): Promise<{ status: "pending_approval"; approvalId: string } | undefined> {
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
    const makerId = principal.kind === "officer" ? principal.officerId : principal.investorId;
    const result = await this.creditInvestorLedger.execute({
      investorId,
      amountRial: amount,
      makerId,
    });
    if (result.status === "credited") {
      res.status(204); // applied directly (below threshold) — unchanged behaviour
      return undefined;
    }
    res.status(202); // parked for a second person's approval
    return { status: result.status, approvalId: result.approvalId };
  }

  @Get("me")
  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  async me(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ balanceRial: string; heldRial: string }> {
    const investorId = principal.kind === "investor" ? principal.investorId : "";
    const { balanceRial, heldRial } = await this.rail.balanceOf(investorId);
    return { balanceRial: String(balanceRial), heldRial: String(heldRial) };
  }
}
