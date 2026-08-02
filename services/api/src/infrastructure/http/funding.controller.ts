import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PERMISSIONS } from "../../application/identity/authorization.js";
import type { Principal } from "../../application/identity/ports.js";
import { CancelFunding } from "../../application/funding/cancel-funding.js";
import { ConfirmFunding } from "../../application/funding/confirm-funding.js";
import { ListMyFunding, ListPendingFunding } from "../../application/funding/list-funding.js";
import type { PendingFundingView } from "../../application/funding/list-funding.js";
import { RejectFunding } from "../../application/funding/reject-funding.js";
import { RequestFunding } from "../../application/funding/request-funding.js";
import type { FundingRequestView } from "../../application/funding/funding-view.js";
import type { PaymentInstructions } from "../../application/funding/ports.js";
import type { CreditResult } from "../../application/approvals/credit-investor-ledger.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";

const investorIdOf = (principal: Principal): string => {
  // The guard enforces the role; this narrows the union for the type system.
  if (principal.kind !== "investor") throw new BadRequestException();
  return principal.investorId;
};

const officerIdOf = (principal: Principal): string =>
  principal.kind === "officer" ? principal.officerId : principal.investorId;

const requireAmount = (body: unknown, field: string): bigint => {
  const raw = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new BadRequestException(`"${field}" is required (integer as a string)`);
  }
  let amount: bigint;
  try {
    amount = BigInt(raw);
  } catch {
    throw new BadRequestException(`"${field}" must be an integer`);
  }
  if (amount <= 0n) {
    throw new BadRequestException(`"${field}" must be positive`);
  }
  return amount;
};

const requireReason = (body: unknown): string => {
  const raw = (body as { reason?: unknown } | null | undefined)?.reason;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new BadRequestException('"reason" is required');
  }
  return raw;
};

// 2.4 / OD-6: money in. The investor declares a transfer and gets a reference;
// treasury confirms what actually arrived, which credits the ledger through the
// existing maker-checker path.
@Controller("funding")
export class FundingController {
  constructor(
    private readonly requestFunding: RequestFunding,
    private readonly listMine: ListMyFunding,
    private readonly cancelFunding: CancelFunding,
    private readonly listPending: ListPendingFunding,
    private readonly confirmFunding: ConfirmFunding,
    private readonly rejectFunding: RejectFunding,
  ) {}

  // --- the investor's own funding ---

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me")
  request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<{ request: FundingRequestView; instructions: PaymentInstructions }> {
    return this.requestFunding.execute({
      investorId: investorIdOf(principal),
      amountRial: requireAmount(body, "amountRial"),
    });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me")
  mine(@CurrentPrincipal() principal: Principal): Promise<FundingRequestView[]> {
    return this.listMine.execute({ investorId: investorIdOf(principal) });
  }

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Post("me/:id/cancel")
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FundingRequestView> {
    return this.cancelFunding.execute({ requestId: id, investorId: investorIdOf(principal) });
  }

  // --- treasury. Confirming a deposit IS crediting the ledger, so it sits
  // behind the same permission as a direct credit and inherits maker-checker.

  @RequirePermission(PERMISSIONS.LEDGER_CREDIT)
  @Get("pending")
  pending(): Promise<PendingFundingView[]> {
    return this.listPending.execute();
  }

  @RequirePermission(PERMISSIONS.LEDGER_CREDIT)
  @Post(":id/confirm")
  confirm(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ request: FundingRequestView; creditStatus: CreditResult }> {
    return this.confirmFunding.execute({
      requestId: id,
      // What actually arrived, which is not necessarily what was declared.
      receivedRial: requireAmount(body, "receivedRial"),
      officerId: officerIdOf(principal),
    });
  }

  @RequirePermission(PERMISSIONS.LEDGER_CREDIT)
  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<FundingRequestView> {
    return this.rejectFunding.execute({
      requestId: id,
      reason: requireReason(body),
      officerId: officerIdOf(principal),
    });
  }
}
