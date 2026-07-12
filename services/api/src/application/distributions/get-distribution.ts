import type { Distribution, DistributionState } from "../../domain/distributions/distribution.js";
import { DistributionNotFoundError } from "./errors.js";
import type { DistributionRepository } from "./ports.js";

// Read model with the FR-YD-1 reconciliation report. bigints as strings.
export interface DistributionView {
  id: string;
  assetId: string;
  tokenAddress: string;
  totalAmountRial: string;
  state: DistributionState;
  payouts: { investorId: string; tokens: string; amountRial: string }[];
  reconciliation: { declared: string; allocated: string; balanced: boolean };
}

export const toDistributionView = (distribution: Distribution): DistributionView => {
  const allocated = distribution.payouts.reduce((sum, p) => sum + p.amountRial, 0n);
  return {
    id: distribution.id,
    assetId: distribution.assetId,
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
  constructor(private readonly distributions: DistributionRepository) {}

  async execute(input: { distributionId: string }): Promise<DistributionView> {
    return toDistributionView(await loadDistribution(this.distributions, input.distributionId));
  }
}

export class ListDistributions {
  constructor(private readonly distributions: DistributionRepository) {}

  async execute(): Promise<DistributionView[]> {
    return (await this.distributions.findAll()).map(toDistributionView);
  }
}
