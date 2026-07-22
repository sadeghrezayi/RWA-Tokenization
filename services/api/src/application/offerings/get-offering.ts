import type { Offering, OfferingState } from "../../domain/offerings/offering.js";
import type { AssetRepository } from "../assets/ports.js";
import type { InvestorRepository } from "../identity/ports.js";
import { loadOffering } from "./load-offering.js";
import type { OfferingRepository } from "./ports.js";

// Read model. bigints serialize as strings; other investors' positions are
// never exposed to an investor — they see totals plus only their own numbers.
// The officer (no forInvestor) additionally gets a `participants` breakdown so
// the offering page shows who subscribed and how they were allocated (P2:
// resolved to emails). assetName (P2) leads with a human name, not the UUID.
export interface OfferingParticipant {
  investorId: string;
  email: string;
  subscribed: string;
  requested?: string;
  allocated?: string;
  costRial?: string;
  refundRial?: string;
}

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
  participants?: OfferingParticipant[];
}

export const toOfferingView = (
  offering: Offering,
  opts: { assetName?: string; forInvestor?: string; participants?: OfferingParticipant[] } = {},
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
  } else if (opts.participants !== undefined) {
    // Officer path only — never combined with forInvestor.
    view.participants = opts.participants;
  }
  return view;
};

// Aggregates subscriptions by investor and joins each to its close-time
// allocation, resolving emails (P2). Order follows first-subscription order.
const buildParticipants = async (
  offering: Offering,
  investors: InvestorRepository,
): Promise<OfferingParticipant[]> => {
  const subscribedByInvestor = new Map<string, bigint>();
  for (const subscription of offering.subscriptions) {
    subscribedByInvestor.set(
      subscription.investorId,
      (subscribedByInvestor.get(subscription.investorId) ?? 0n) + subscription.tokens,
    );
  }
  const participants: OfferingParticipant[] = [];
  for (const [investorId, subscribed] of subscribedByInvestor) {
    const email = (await investors.findById(investorId))?.email.value ?? investorId;
    const allocation = offering.allocations?.find((a) => a.investorId === investorId);
    participants.push({
      investorId,
      email,
      subscribed: String(subscribed),
      ...(allocation
        ? {
            requested: String(allocation.requested),
            allocated: String(allocation.allocated),
            costRial: String(allocation.costRial),
            refundRial: String(allocation.refundRial),
          }
        : {}),
    });
  }
  return participants;
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
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { offeringId: string; forInvestor?: string }): Promise<OfferingView> {
    const offering = await loadOffering(this.offerings, input.offeringId);
    const asset = await this.assets.findById(offering.assetId);
    // Officer path (no forInvestor) sees the full participant breakdown.
    const participants =
      input.forInvestor === undefined
        ? await buildParticipants(offering, this.investors)
        : undefined;
    return toOfferingView(offering, {
      ...(asset ? { assetName: asset.name } : {}),
      ...(input.forInvestor !== undefined ? { forInvestor: input.forInvestor } : {}),
      ...(participants !== undefined ? { participants } : {}),
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
