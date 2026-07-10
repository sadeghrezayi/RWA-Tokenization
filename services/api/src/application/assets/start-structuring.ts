import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

export class StartStructuring {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: { assetId: string; actor: string }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    await this.assets.save(asset.startStructuring());
    await this.events.append({
      assetId: input.assetId,
      event: "structuring_started",
      actor: input.actor,
    });
  }
}
