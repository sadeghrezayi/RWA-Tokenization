import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

// FR-AO-4: the operator approval that unlocks token configuration. The
// completeness gate itself lives in the domain (Asset.approve).
export class ApproveAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: { assetId: string; actor: string }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    await this.assets.save(asset.approve());
    await this.events.append({
      assetId: input.assetId,
      event: "asset_approved",
      actor: input.actor,
    });
  }
}
