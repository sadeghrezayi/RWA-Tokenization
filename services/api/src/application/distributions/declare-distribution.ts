import { Distribution } from "../../domain/distributions/distribution.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import { AssetNotTokenizedForDistributionError, NoHoldersError } from "./errors.js";
import type { DistributionRepository, HolderSnapshotProvider } from "./ports.js";

// FR-YD-1: declare an income amount for a tokenized asset, freeze a record-date
// holder snapshot, and compute the pro-rata payouts. No money moves yet — the
// operator reviews the reconciliation, then approves the payout separately.
export class DeclareDistribution {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly assets: AssetRepository,
    private readonly snapshots: HolderSnapshotProvider,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    totalAmountRial: bigint;
    actor: string;
  }): Promise<{ distributionId: string }> {
    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
      throw new AssetNotTokenizedForDistributionError(asset.id);
    }
    const snapshot = await this.snapshots.snapshot(asset.tokenAddress);
    if (snapshot.length === 0) {
      throw new NoHoldersError(asset.id);
    }
    const distribution = Distribution.declare({
      id: this.ids.nextId(),
      assetId: asset.id,
      tokenAddress: asset.tokenAddress,
      totalAmountRial: input.totalAmountRial,
      snapshot,
    });
    await this.distributions.save(distribution);
    await this.events.append({
      assetId: asset.id,
      event: "distribution_declared",
      actor: input.actor,
      details: {
        distributionId: distribution.id,
        totalAmountRial: String(input.totalAmountRial),
        holders: String(snapshot.length),
      },
    });
    return { distributionId: distribution.id };
  }
}
