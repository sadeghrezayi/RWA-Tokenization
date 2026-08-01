import type { AssetRepository } from "../assets/ports.js";
import type { GetInvestorSales, SubscriptionHistoryItem } from "../crm/investor-sales.js";
import type { DistributionRepository } from "../distributions/ports.js";

export interface PortfolioHolding {
  assetId: string;
  assetName: string;
  tokens: string;
  valueRial?: string;
  valuationFresh: boolean;
  valuedAt?: string;
  // Share of the portfolio's total value, in basis points (10 000 = 100%).
  // Absent when the holding has no value to take a share of — inventing a
  // percentage for an unvalued asset would be a fabricated number.
  shareBasisPoints?: number;
}

export interface PortfolioIncomeItem {
  distributionId: string;
  assetId: string;
  assetName: string;
  amountRial: string;
  paidAt: string;
}

// 2.5: the holder's own view of their position. Strictly factual and
// backward-looking — what was invested, what the latest ATTESTED valuation
// makes it worth (with the date it was attested), and what income has actually
// been paid. Deliberately no projected yield or expected return: OD-21 rules
// those out, and nothing here would support them honestly.
export interface PortfolioView {
  totalInvestedRial: string;
  portfolioValueRial: string;
  portfolioValueFresh: boolean;
  // The OLDEST valuation date across the holdings — the honest "as at" for a
  // total assembled from several attestations.
  valuedAt?: string;
  incomeReceivedRial: string;
  holdings: PortfolioHolding[];
  income: PortfolioIncomeItem[];
  subscriptions: SubscriptionHistoryItem[];
}

export class GetMyPortfolio {
  constructor(
    private readonly sales: GetInvestorSales,
    private readonly distributions: DistributionRepository,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { investorId: string }): Promise<PortfolioView> {
    // Value, invested and subscription history already have one definition in
    // the sales read model; this composes it rather than recomputing it.
    const sales = await this.sales.execute({ investorId: input.investorId });
    const totalValue = BigInt(sales.portfolioValueRial);

    const holdings: PortfolioHolding[] = sales.holdings.map((holding) => ({
      ...holding,
      ...(holding.valueRial !== undefined && totalValue > 0n
        ? {
            shareBasisPoints: Number((BigInt(holding.valueRial) * 10_000n) / totalValue),
          }
        : {}),
    }));

    const valuationDates = sales.holdings
      .map((holding) => holding.valuedAt)
      .filter((date): date is string => date !== undefined)
      .sort();

    const income = await this.incomeFor(input.investorId);

    return {
      totalInvestedRial: sales.totalInvestedRial,
      portfolioValueRial: sales.portfolioValueRial,
      portfolioValueFresh: sales.portfolioValueFresh,
      ...(valuationDates[0] !== undefined ? { valuedAt: valuationDates[0] } : {}),
      incomeReceivedRial: String(income.reduce((sum, item) => sum + BigInt(item.amountRial), 0n)),
      holdings,
      income,
      subscriptions: sales.subscriptions,
    };
  }

  private async incomeFor(investorId: string): Promise<PortfolioIncomeItem[]> {
    const names = new Map<string, string>();
    const assetName = async (assetId: string): Promise<string> => {
      let name = names.get(assetId);
      if (name === undefined) {
        name = (await this.assets.findById(assetId))?.name ?? assetId;
        names.set(assetId, name);
      }
      return name;
    };

    const items: PortfolioIncomeItem[] = [];
    for (const distribution of await this.distributions.findAll()) {
      // Only money that actually moved. A declared distribution is a promise,
      // not income, and a paid one without a date cannot be placed on a
      // statement (rows written before the paid-at column existed).
      if (distribution.state !== "paid" || distribution.paidAt === undefined) {
        continue;
      }
      for (const payout of distribution.payouts) {
        if (payout.investorId !== investorId) {
          continue;
        }
        items.push({
          distributionId: distribution.id,
          assetId: distribution.assetId,
          assetName: await assetName(distribution.assetId),
          amountRial: String(payout.amountRial),
          paidAt: distribution.paidAt.toISOString(),
        });
      }
    }
    // Newest payment first: a statement is read from the most recent event.
    return items.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }
}
