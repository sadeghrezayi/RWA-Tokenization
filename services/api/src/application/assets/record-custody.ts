import { CustodyArrangement } from "../../domain/assets/custody-arrangement.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

export class RecordCustody {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    custodianName: string;
    location: string;
    actor: string;
  }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    const custody = CustodyArrangement.of({
      custodianName: input.custodianName,
      location: input.location,
    });
    await this.assets.save(asset.recordCustody(custody));
    await this.events.append({
      assetId: input.assetId,
      event: "custody_recorded",
      actor: input.actor,
      details: { custodianName: custody.custodianName, location: custody.location },
    });
  }
}
