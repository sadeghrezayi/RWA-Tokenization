import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

// 3.1: what the token conveys. Conveying and withdrawing are the same decision
// in two directions, so they are one use case and both are audited — a right
// quietly removed is as consequential as one quietly added.
export class SetConveyedRight {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    kind: string;
    // The wording the right was granted in. Absent means "withdraw it".
    note?: string;
    actor: string;
  }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    const updated =
      input.note === undefined
        ? asset.withholdRight(input.kind)
        : asset.conveyRight(input.kind, input.note);

    await this.assets.save(updated);
    await this.events.append({
      assetId: input.assetId,
      event: input.note === undefined ? "right_withdrawn" : "right_conveyed",
      actor: input.actor,
      details: { kind: input.kind, ...(input.note !== undefined ? { note: input.note } : {}) },
    });
  }
}
