import type { Offering, OfferingState } from "../../domain/offerings/offering.js";
import { loadOffering } from "./load-offering.js";
import type { OfferingRepository } from "./ports.js";

// Read model. bigints serialize as strings; other investors' positions are
// never exposed — an investor sees totals plus only their own numbers.
export interface OfferingView {
  id: string;
  assetId: string;
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

export const toOfferingView = (offering: Offering, forInvestor?: string): OfferingView => {
  const totalSubscribed = offering.subscriptions.reduce((sum, s) => sum + s.tokens, 0n);
  const view: OfferingView = {
    id: offering.id,
    assetId: offering.assetId,
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
  if (forInvestor !== undefined) {
    const mine = offering.subscriptions
      .filter((s) => s.investorId === forInvestor)
      .reduce((sum, s) => sum + s.tokens, 0n);
    view.mySubscribed = String(mine);
    const allocation = offering.allocations?.find((a) => a.investorId === forInvestor);
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

export class GetOffering {
  constructor(private readonly offerings: OfferingRepository) {}

  async execute(input: { offeringId: string; forInvestor?: string }): Promise<OfferingView> {
    return toOfferingView(await loadOffering(this.offerings, input.offeringId), input.forInvestor);
  }
}

export class ListOfferings {
  constructor(private readonly offerings: OfferingRepository) {}

  async execute(input: { forInvestor?: string }): Promise<OfferingView[]> {
    return (await this.offerings.findAll()).map((o) => toOfferingView(o, input.forInvestor));
  }
}
