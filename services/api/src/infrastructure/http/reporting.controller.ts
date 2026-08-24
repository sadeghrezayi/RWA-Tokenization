import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { GetAssetOverview } from "../../application/reporting/asset-overview.js";
import type { PortfolioOverview } from "../../application/reporting/asset-overview.js";
import { GetSystemHealth } from "../../application/reporting/system-health.js";
import type { SystemHealthView } from "../../application/reporting/system-health.js";
import { GetWorkQueue } from "../../application/ops/get-work-queue.js";
import type { WorkQueueView } from "../../application/ops/get-work-queue.js";
import { GetAuditTrail } from "../../application/reporting/audit-trail.js";
import type { AuditEventView } from "../../application/reporting/audit-trail.js";
import { GetHolderRegistry } from "../../application/registry/get-holder-registry.js";
import { ReconcileDistributions } from "../../application/reporting/reconcile-distributions.js";
import type { DistributionReconciliationView } from "../../application/reporting/reconcile-distributions.js";
import type { HolderRegistryView } from "../../application/registry/get-holder-registry.js";
import {
  ExportHolderRegistryCsv,
  ExportTransferHistoryCsv,
} from "../../application/registry/export-csv.js";
import type { CsvExport } from "../../application/registry/export-csv.js";
import { RequirePermission } from "./auth.guard.js";
import { PERMISSIONS } from "../../application/identity/authorization.js";

// Response surface needed for CSV downloads — kept minimal like the error
// filter's, so no framework types leak beyond this file.
interface CsvResponse {
  setHeader(name: string, value: string): void;
}

// Reporting surfaces for the admin console (FR-RA / FR-PT-3). Operator-only.
// Own `/reporting` prefix so nothing collides with `/assets/:id` etc.
@Controller("reporting")
@RequirePermission(PERMISSIONS.REPORTING_READ)
export class ReportingController {
  constructor(
    private readonly assetOverview: GetAssetOverview,
    private readonly systemHealth: GetSystemHealth,
    private readonly holderRegistry: GetHolderRegistry,
    private readonly registryCsv: ExportHolderRegistryCsv,
    private readonly historyCsv: ExportTransferHistoryCsv,
    private readonly auditTrail: GetAuditTrail,
    private readonly workQueue: GetWorkQueue,
    private readonly reconcileDistributions: ReconcileDistributions,
  ) {}

  // 1.8: everything currently waiting on a human decision, oldest first.
  @Get("work-queue")
  queue(): Promise<WorkQueueView> {
    return this.workQueue.execute();
  }

  @Get("assets")
  overview(): Promise<PortfolioOverview> {
    return this.assetOverview.execute();
  }

  @Get("health")
  health(): Promise<SystemHealthView> {
    return this.systemHealth.execute();
  }

  @Get("assets/:id/registry")
  registry(@Param("id") id: string): Promise<HolderRegistryView> {
    return this.holderRegistry.execute({ assetId: id });
  }

  @Get("assets/:id/registry.csv")
  async registryExport(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: CsvResponse,
  ): Promise<string> {
    return asDownload(await this.registryCsv.execute({ assetId: id }), res);
  }

  @Get("assets/:id/transfers.csv")
  async historyExport(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: CsvResponse,
  ): Promise<string> {
    return asDownload(await this.historyCsv.execute({ assetId: id }), res);
  }

  // FR-RA-4: "distributions vs bank records" — what an auditor role must be
  // able to verify. Reads REPORTING_READ, the same as everything else on this
  // controller, so the auditor role reaches it with no new permission.
  @Get("distributions/reconciliation")
  distributionsReconciliation(): Promise<DistributionReconciliationView[]> {
    return this.reconcileDistributions.execute();
  }

  @Get("audit")
  audit(
    @Query("assetId") assetId?: string,
    @Query("limit") limit?: string,
  ): Promise<AuditEventView[]> {
    const parsed = limit === undefined ? Number.NaN : Number(limit);
    return this.auditTrail.execute({
      ...(assetId !== undefined && assetId !== "" ? { assetId } : {}),
      ...(Number.isInteger(parsed) && parsed > 0 ? { limit: parsed } : {}),
    });
  }
}

const asDownload = (exported: CsvExport, res: CsvResponse): string => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
  return exported.csv;
};
