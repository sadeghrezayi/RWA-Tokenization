import type { Offering, OfferingState } from "../../domain/offerings/offering.js";
import type { AssetRepository } from "../assets/ports.js";
import { loadOffering } from "./load-offering.js";
import type { OfferingRepository } from "./ports.js";

// Read model. bigints serialize as strings; other investors' positions are
// never exposed — an investor sees totals plus only their own numbers.
// assetName (P2) lets the UI lead with a human name, never the asset UUID.
export interface OfferingView {
  id: string;
  assetId: string;
  assetName: string;
  tokenAddress: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  opensAt: string;
  closesAt: string;
  state: OfferingState;
  totalSubscribed: string;
  mySubscribed?: string;
  myAllocation?: { requested: string; allocated: string; costRial: string; refundRial: string };
}

export const toOfferingView = (
  offering: Offering,
  opts: { assetName?: string; forInvestor?: string } = {},
): OfferingView => {
  const totalSubscribed = offering.subscriptions.reduce((sum, s) => sum + s.tokens, 0n);
  const view: OfferingView = {
    id: offering.id,
    assetId: offering.assetId,
    assetName: opts.assetName ?? `Asset ${offering.assetId.slice(0, 8)}`,
    tokenAddress: offering.tokenAddress,
    supply: String(offering.supply),
    priceRial: String(offering.priceRial),
    minPerInvestor: String(offering.minPerInvestor),
    maxPerInvestor: String(offering.maxPerInvestor),
    minimumRaise: String(offering.minimumRaise),
    opensAt: offering.opensAt.toISOString(),
    closesAt: offering.closesAt.toISOString(),
    state: offering.state,
    totalSubscribed: String(totalSubscribed),
  };
  if (opts.forInvestor !== undefined) {
    const mine = offering.subscriptions
      .filter((s) => s.investorId === opts.forInvestor)
      .reduce((sum, s) => sum + s.tokens, 0n);
    view.mySubscribed = String(mine);
    const allocation = offering.allocations?.find((a) => a.investorId === opts.forInvestor);
    if (allocation) {
      view.myAllocation = {
        requested: String(allocation.requested),
        allocated: String(allocation.allocated),
        costRial: String(allocation.costRial),
        refundRial: String(allocation.refundRial),
      };
    }
  }
  return view;
};

// Builds an assetId → name lookup so lists don't issue one query per row.
const assetNames = async (assets: AssetRepository): Promise<Map<string, string>> => {
  const all = await assets.findAll();
  return new Map(all.map((a) => [a.id, a.name]));
};

export class GetOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { offeringId: string; forInvestor?: string }): Promise<OfferingView> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    const asset = await this.assets.findById(offering.assetId);
    return toOfferingView(offering, {
      ...(asset ? { assetName: asset.name } : {}),
      ...(input.forInvestor !== undefined ? { forInvestor: input.forInvestor } : {}),
    });
  }
}

export class ListOfferings {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { forInvestor?: string }): Promise<OfferingView[]> {
    const [offerings, names] = await Promise.all([
      this.offerings.findAll(),
      assetNames(this.assets),
    ]);
    return offerings.map((o) => {
      const assetName = names.get(o.assetId);
      return toOfferingView(o, {
        ...(assetName !== undefined ? { assetName } : {}),
        ...(input.forInvestor !== undefined ? { forInvestor: input.forInvestor } : {}),
      });
    });
  }
}
