import { Asset } from "../../domain/assets/asset.js";
import type { IdGenerator } from "../identity/ports.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

export class ProposeAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: { name: string; actor: string }): Promise<{ assetId: string }> {
    const asset = Asset.propose(this.ids.nextId(), input.name, "asset_backed");
    await this.assets.save(asset);
    await this.events.append({ assetId: asset.id, event: "asset_proposed", actor: input.actor });
    return { assetId: asset.id };
  }
}
