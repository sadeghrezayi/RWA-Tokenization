import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { DecideApproval } from "../../application/approvals/decide-approval.js";
import { ListApprovals } from "../../application/approvals/list-approvals.js";
import type { ApprovalView } from "../../application/approvals/list-approvals.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";
import type { Principal } from "../../application/identity/ports.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";

// The @RequirePermission(approval.decide) guard guarantees the officer kind;
// this narrows the union and yields the checker identity for four-eyes.
const checkerIdOf = (principal: Principal): string => {
  if (principal.kind !== "officer") throw new BadRequestException();
  return principal.officerId;
};

// T1/T3 maker-checker queue. The checker (a different person than the maker)
// approves — which runs the action — or rejects.
@Controller("approvals")
export class ApprovalsController {
  constructor(
    private readonly listApprovals: ListApprovals,
    private readonly decideApproval: DecideApproval,
  ) {}

  @RequirePermission(PERMISSIONS.APPROVAL_DECIDE)
  @Get()
  pending(): Promise<ApprovalView[]> {
    return this.listApprovals.pending();
  }

  @RequirePermission(PERMISSIONS.APPROVAL_DECIDE)
  @Post(":id/approve")
  @HttpCode(204)
  approve(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    return this.decideApproval.approve({ approvalId: id, checkerId: checkerIdOf(principal) });
  }

  @RequirePermission(PERMISSIONS.APPROVAL_DECIDE)
  @Post(":id/reject")
  @HttpCode(204)
  reject(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    const reason = (body as Record<string, unknown> | null | undefined)?.reason;
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new BadRequestException(`"reason" is required`);
    }
    return this.decideApproval.reject({
      approvalId: id,
      checkerId: checkerIdOf(principal),
      reason,
    });
  }
}
