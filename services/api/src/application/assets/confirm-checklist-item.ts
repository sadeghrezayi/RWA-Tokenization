import type { ChecklistItem } from "../../domain/assets/onboarding-checklist.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

export class ConfirmChecklistItem {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: { assetId: string; item: ChecklistItem; actor: string }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    await this.assets.save(asset.confirmChecklistItem(input.item));
    await this.events.append({
      assetId: input.assetId,
      event: "checklist_item_confirmed",
      actor: input.actor,
      details: { item: input.item },
    });
  }
}
