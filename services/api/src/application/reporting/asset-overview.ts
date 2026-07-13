import type { AssetState } from "../../domain/assets/asset.js";
import type { OfferingState } from "../../domain/offerings/offering.js";
import type { DistributionState } from "../../domain/distributions/distribution.js";
import type { AssetRepository } from "../assets/ports.js";
import type { OfferingRepository } from "../offerings/ports.js";
import type { DistributionRepository } from "../distributions/ports.js";
import type { HolderSnapshotProvider } from "../distributions/ports.js";
import type { AttestationRepository } from "../attestations/ports.js";
import type { Clock } from "../offerings/ports.js";

export interface OfferingSummary {
  id: string;
  state: OfferingState;
  supply: string;
  subscribed: string;
  priceRial: string;
}

export interface DistributionSummary {
  id: string;
  state: DistributionState;
  totalAmountRial: string;
}

// FR-OR: the latest signed valuation with its freshness (P5 verifiability).
export interface LatestValuation {
  valueRial: string;
  asOf: string;
  validUntil: string;
  fresh: boolean;
}

export interface AssetOverview {
  id: string;
  name: string;
  state: AssetState;
  tokenAddress?: string;
  circulatingSupply: string;
  holderCount: number;
  totalRaisedRial: string;
  totalDistributedRial: string;
  offerings: OfferingSummary[];
  distributions: DistributionSummary[];
  latestValuation?: LatestValuation;
}

export interface PortfolioOverview {
  assets: AssetOverview[];
  summary: {
    assetCount: number;
    tokenizedCount: number;
    totalRaisedRial: string;
    totalDistributedRial: string;
  };
}

export class GetAssetOverview {
  constructor(
    private readonly assets: AssetRepository,
    private readonly offerings: OfferingRepository,
    private readonly distributions: DistributionRepository,
    private readonly snapshots: HolderSnapshotProvider,
    private readonly attestations: AttestationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PortfolioOverview> {
    const [assets, allOfferings, allDistributions] = await Promise.all([
      this.assets.findAll(),
      this.offerings.findAll(),
      this.distributions.findAll(),
    ]);

    const overviews: AssetOverview[] = [];
    for (const asset of assets) {
      const offerings = allOfferings.filter((o) => o.assetId === asset.id);
      const distributions = allDistributions.filter((d) => d.assetId === asset.id);

      // Circulating supply + holders are the on-chain truth for a tokenized asset.
      let circulatingSupply = 0n;
      let holderCount = 0;
      if (asset.tokenAddress !== undefined) {
        const holders = await this.snapshots.snapshot(asset.tokenAddress);
        holderCount = holders.length;
        circulatingSupply = holders.reduce((sum, h) => sum + h.tokens, 0n);
      }

      // Raised = captured cost on successfully-closed offerings (money actually settled).
      const totalRaisedRial = offerings
        .filter((o) => o.state === "closed_success")
        .flatMap((o) => o.allocations ?? [])
        .reduce((sum, a) => sum + a.costRial, 0n);

      // Distributed = paid distributions only.
      const totalDistributedRial = distributions
        .filter((d) => d.state === "paid")
        .reduce((sum, d) => sum + d.totalAmountRial, 0n);

      // FR-OR: the most recent signed valuation, with freshness (FR-OR-3).
      const valuation = await this.attestations.findLatest(asset.id, "valuation");
      const latestValuation: LatestValuation | undefined = valuation
        ? {
            valueRial: String(valuation.valueRial),
            asOf: valuation.issuedAt.toISOString(),
            validUntil: valuation.validUntil.toISOString(),
            fresh: valuation.isFresh(this.clock.now()),
          }
        : undefined;

      overviews.push({
        id: asset.id,
        name: asset.name,
        state: asset.state,
        ...(asset.tokenAddress !== undefined ? { tokenAddress: asset.tokenAddress } : {}),
        circulatingSupply: String(circulatingSupply),
        holderCount,
        totalRaisedRial: String(totalRaisedRial),
        totalDistributedRial: String(totalDistributedRial),
        offerings: offerings.map((o) => ({
          id: o.id,
          state: o.state,
          supply: String(o.supply),
          subscribed: String(o.subscriptions.reduce((sum, s) => sum + s.tokens, 0n)),
          priceRial: String(o.priceRial),
        })),
        distributions: distributions.map((d) => ({
          id: d.id,
          state: d.state,
          totalAmountRial: String(d.totalAmountRial),
        })),
        ...(latestValuation !== undefined ? { latestValuation } : {}),
      });
    }

    const sumStr = (pick: (a: AssetOverview) => string): string =>
      String(overviews.reduce((sum, a) => sum + BigInt(pick(a)), 0n));

    return {
      assets: overviews,
      summary: {
        assetCount: overviews.length,
        tokenizedCount: overviews.filter((a) => a.tokenAddress !== undefined).length,
        totalRaisedRial: sumStr((a) => a.totalRaisedRial),
        totalDistributedRial: sumStr((a) => a.totalDistributedRial),
      },
    };
  }
}
