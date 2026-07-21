import type { AssetRepository } from "../assets/ports.js";
import type { AttestationRepository } from "../attestations/ports.js";
import type { OfferingRepository } from "../offerings/ports.js";
import type { Clock } from "../offerings/ports.js";
import type { TokenEventSource } from "../registry/ports.js";
import type { GetMyHoldings } from "../transfers/get-holdings.js";

// Sales view (user-approved scope 2026-07-20): what this investor bought and
// what it is worth now. Invested = captured allocation costs from closed
// offerings; value = pro-rata share of the LATEST attested valuation (P5),
// honestly flagged stale when the attestation window has passed (FR-OR-3).
export interface SubscriptionHistoryItem {
  offeringId: string;
  assetName: string;
  state: string;
  requested: string;
  allocated: string;
  costRial: string;
  refundRial: string;
  closesAt: string;
}

export interface ValuedHolding {
  assetId: string;
  assetName: string;
  tokens: string;
  valueRial?: string;
  valuationFresh: boolean;
}

export interface InvestorSalesView {
  totalInvestedRial: string;
  portfolioValueRial: string;
  portfolioValueFresh: boolean;
  holdings: ValuedHolding[];
  subscriptions: SubscriptionHistoryItem[];
}

export class GetInvestorSales {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly assets: AssetRepository,
    private readonly attestations: AttestationRepository,
    private readonly supply: TokenEventSource,
    private readonly holdings: GetMyHoldings,
    private readonly clock: Clock,
  ) {}

  async execute(input: { investorId: string }): Promise<InvestorSalesView> {
    const now = this.clock.now();
    const assetNames = new Map<string, string>();
    const assetName = async (assetId: string): Promise<string> => {
      let name = assetNames.get(assetId);
      if (name === undefined) {
        name = (await this.assets.findById(assetId))?.name ?? assetId;
        assetNames.set(assetId, name);
      }
      return name;
    };

    // Subscription history: every offering this investor touched, newest
    // close first. Open offerings show the pending subscription honestly.
    const offerings = [...(await this.offerings.findAll())].sort(
      (a, b) => b.closesAt.getTime() - a.closesAt.getTime(),
    );
    let totalInvestedRial = 0n;
    const subscriptions: SubscriptionHistoryItem[] = [];
    for (const offering of offerings) {
      const allocation = offering.allocations?.find((a) => a.investorId === input.investorId);
      const subscription = offering.subscriptions.find((s) => s.investorId === input.investorId);
      if (!allocation && !subscription) {
        continue;
      }
      totalInvestedRial += allocation?.costRial ?? 0n;
      subscriptions.push({
        offeringId: offering.id,
        assetName: await assetName(offering.assetId),
        state: offering.state,
        requested: String(allocation?.requested ?? subscription?.tokens ?? 0n),
        allocated: String(allocation?.allocated ?? 0n),
        costRial: String(allocation?.costRial ?? 0n),
        refundRial: String(allocation?.refundRial ?? 0n),
        closesAt: offering.closesAt.toISOString(),
      });
    }

    // Portfolio value: pro-rata share of the latest attested valuation per
    // holding; stale or missing valuations flag the total as not fresh.
    const holdings = await this.holdings.execute({ investorId: input.investorId });
    let portfolioValueRial = 0n;
    let portfolioValueFresh = true;
    const valued: ValuedHolding[] = [];
    for (const holding of holdings) {
      const attestation = await this.attestations.findLatest(holding.assetId, "valuation");
      const supply = await this.supply.totalSupply(holding.tokenAddress);
      const fresh = attestation?.isFresh(now) ?? false;
      const valueRial =
        attestation !== undefined && supply > 0n
          ? (attestation.valueRial * BigInt(holding.tokens)) / supply
          : undefined;
      portfolioValueRial += valueRial ?? 0n;
      portfolioValueFresh = portfolioValueFresh && fresh;
      valued.push({
        assetId: holding.assetId,
        assetName: holding.assetName,
        tokens: holding.tokens,
        ...(valueRial !== undefined ? { valueRial: String(valueRial) } : {}),
        valuationFresh: fresh,
      });
    }

    return {
      totalInvestedRial: String(totalInvestedRial),
      portfolioValueRial: String(portfolioValueRial),
      portfolioValueFresh: holdings.length > 0 ? portfolioValueFresh : true,
      holdings: valued,
      subscriptions,
    };
  }
}
