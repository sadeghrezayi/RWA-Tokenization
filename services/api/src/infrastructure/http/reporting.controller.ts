import { Controller, Get } from "@nestjs/common";
import { GetAssetOverview } from "../../application/reporting/asset-overview.js";
import type { PortfolioOverview } from "../../application/reporting/asset-overview.js";
import { GetSystemHealth } from "../../application/reporting/system-health.js";
import type { SystemHealthView } from "../../application/reporting/system-health.js";
import { RequireRole } from "./auth.guard.js";

// Reporting surfaces for the admin Overview tab (FR-RA / FR-PT-3). Operator-only.
// Own `/reporting` prefix so nothing collides with `/assets/:id` etc.
@Controller("reporting")
@RequireRole("officer")
export class ReportingController {
  constructor(
    private readonly assetOverview: GetAssetOverview,
    private readonly systemHealth: GetSystemHealth,
  ) {}

  @Get("assets")
  overview(): Promise<PortfolioOverview> {
    return this.assetOverview.execute();
  }

  @Get("health")
  health(): Promise<SystemHealthView> {
    return this.systemHealth.execute();
  }
}
