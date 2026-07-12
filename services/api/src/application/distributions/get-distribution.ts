import type { Distribution, DistributionState } from "../../domain/distributions/distribution.js";
import type { AssetRepository } from "../assets/ports.js";
import { DistributionNotFoundError } from "./errors.js";
import type { DistributionRepository } from "./ports.js";

// Read model with the FR-YD-1 reconciliation report. bigints as strings;
// assetName (P2) so the UI leads with a name, not the asset UUID.
export interface DistributionView {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  totalAmountRial: string;
  state: DistributionState;
  payouts: { investorId: string; tokens: string; amountRial: string }[];
  reconciliation: { declared: string; allocated: string; balanced: boolean };
}

export const toDistributionView = (
  distribution: Distribution,
  assetName?: string,
): DistributionView => {
  const allocated = distribution.payouts.reduce((sum, p) => sum + p.amountRial, 0n);
  return {
    id: distribution.id,
    assetId: distribution.assetId,
    assetName: assetName ?? `Asset ${distribution.assetId.slice(0, 8)}`,
    tokenAddress: distribution.tokenAddress,
    totalAmountRial: String(distribution.totalAmountRial),
    state: distribution.state,
    payouts: distribution.payouts.map((p) => ({
      investorId: p.investorId,
      tokens: String(p.tokens),
      amountRial: String(p.amountRial),
    })),
    reconciliation: {
      declared: String(distribution.totalAmountRial),
      allocated: String(allocated),
      balanced: allocated === distribution.totalAmountRial,
    },
  };
};

export const loadDistribution = async (
  distributions: DistributionRepository,
  distributionId: string,
): Promise<Distribution> => {
  const distribution = await distributions.findById(distributionId);
  if (!distribution) {
    throw new DistributionNotFoundError(distributionId);
  }
  return distribution;
};

export class GetDistribution {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { distributionId: string }): Promise<DistributionView> {
    const distribution = await loadDistribution(this.distributions, input.distributionId);
    const asset = await this.assets.findById(distribution.assetId);
    return toDistributionView(distribution, asset?.name);
  }
}

export class ListDistributions {
  constructor(
    private readonly distributions: DistributionRepository,
    private readonly assets: AssetRepository,
  ) {}

  async execute(): Promise<DistributionView[]> {
    const [distributions, all] = await Promise.all([
      this.distributions.findAll(),
      this.assets.findAll(),
    ]);
    const names = new Map(all.map((a) => [a.id, a.name]));
    return distributions.map((d) => toDistributionView(d, names.get(d.assetId)));
  }
}
