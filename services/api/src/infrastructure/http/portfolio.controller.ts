import { BadRequestException, Controller, Get } from "@nestjs/common";
import { PERMISSIONS } from "../../application/identity/authorization.js";
import type { Principal } from "../../application/identity/ports.js";
import { GetMyPortfolio } from "../../application/portfolio/get-my-portfolio.js";
import type { PortfolioView } from "../../application/portfolio/get-my-portfolio.js";
import { CurrentPrincipal, RequirePermission } from "./auth.guard.js";

const investorIdOf = (principal: Principal): string => {
  // The guard enforces the role; this narrows the union for the type system.
  if (principal.kind !== "investor") throw new BadRequestException();
  return principal.investorId;
};

// 2.5: the holder's own portfolio. Self-scoped only — there is deliberately no
// route here for reading somebody else's position; the officer's view of an
// investor lives behind investor.read on the directory endpoints.
@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly portfolio: GetMyPortfolio) {}

  @RequirePermission(PERMISSIONS.INVESTOR_PORTAL)
  @Get("me")
  me(@CurrentPrincipal() principal: Principal): Promise<PortfolioView> {
    return this.portfolio.execute({ investorId: investorIdOf(principal) });
  }
}
