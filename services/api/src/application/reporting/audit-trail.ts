import type { AssetRepository } from "../assets/ports.js";
import type { InvestorRepository } from "../identity/ports.js";
import type { AssetEventReader } from "./ports.js";

// FR-RA-2 / §14 step 9: the queryable audit trail. Every privileged action is
// an asset_events row; this view names assets and resolves investor actors to
// emails (P2) while leaving operator identifiers as recorded.
export interface AuditEventView {
  id: string;
  assetId: string;
  assetName: string;
  event: string;
  actor: string;
  details: Record<string, string>;
  at: string;
}

const DEFAULT_LIMIT = 200;

export class GetAuditTrail {
  constructor(
    private readonly events: AssetEventReader,
    private readonly assets: AssetRepository,
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { assetId?: string; limit?: number }): Promise<AuditEventView[]> {
    const rows = await this.events.list({
      ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
      limit: input.limit ?? DEFAULT_LIMIT,
    });

    // Resolve each distinct asset/actor once; unknown ids stay visible as-is.
    const assetNames = new Map<string, string>();
    const actorNames = new Map<string, string>();
    const views: AuditEventView[] = [];
    for (const row of rows) {
      let assetName = assetNames.get(row.assetId);
      if (assetName === undefined) {
        assetName = (await this.assets.findById(row.assetId))?.name ?? row.assetId;
        assetNames.set(row.assetId, assetName);
      }
      let actor = actorNames.get(row.actor);
      if (actor === undefined) {
        actor = (await this.investors.findById(row.actor))?.email.value ?? row.actor;
        actorNames.set(row.actor, actor);
      }
      views.push({
        id: row.id,
        assetId: row.assetId,
        assetName,
        event: row.event,
        actor,
        details: row.details,
        at: row.at.toISOString(),
      });
    }
    return views;
  }
}
