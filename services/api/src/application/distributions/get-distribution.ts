import type { Distribution, DistributionState } from "../../domain/distributions/distribution.js";
import type { AssetRepository } from "../assets/ports.js";
import type { InvestorRepository } from "../identity/ports.js";
import { DistributionNotFoundError } from "./errors.js";
import type { DistributionRepository } from "./ports.js";

// Read model with the FR-YD-1 reconciliation report. bigints as strings;
// assetName (P2) so the UI leads with a name, not the asset UUID; each payout
// carries the holder's email (P2), falling back to the id when unknown.
export interface DistributionView {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  totalAmountRial: string;
  state: DistributionState;
  payouts: { investorId: string; email: string; tokens: string; amountRial: string }[];
  reconciliation: { declared: string; allocated: string; balanced: boolean };
}

export const toDistributionView = (
  distribution: Distribution,
  opts: { assetName?: string; emails?: Map<string, string> } = {},
): DistributionView => {
  const allocated = distribution.payouts.reduce((sum, p) => sum + p.amountRial, 0n);
  return {
    id: distribution.id,
    assetId: distribution.assetId,
    assetName: opts.assetName ?? `Asset ${distribution.assetId.slice(0, 8)}`,
    tokenAddress: distribution.tokenAddress,
    totalAmountRial: String(distribution.totalAmountRial),
    state: distribution.state,
    payouts: distribution.payouts.map((p) => ({
      investorId: p.investorId,
      email: opts.emails?.get(p.investorId) ?? p.investorId,
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
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { distributionId: string }): Promise<DistributionView> {
    const distribution = await loadDistribution(this.distributions, input.distributionId);
    const asset = await this.assets.findById(distribution.assetId);
    const emails = new Map<string, string>();
    for (const payout of distribution.payouts) {
      if (!emails.has(payout.investorId)) {
        const email = (await this.investors.findById(payout.investorId))?.email.value;
        if (email !== undefined) {
          emails.set(payout.investorId, email);
        }
      }
    }
    return toDistributionView(distribution, {
      ...(asset ? { assetName: asset.name } : {}),
      emails,
    });
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
    return distributions.map((d) => {
      const assetName = names.get(d.assetId);
      return toDistributionView(d, assetName !== undefined ? { assetName } : {});
    });
  }
}
