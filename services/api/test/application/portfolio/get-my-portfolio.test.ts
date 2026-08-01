import { beforeEach, describe, expect, it } from "vitest";
import { GetInvestorSales } from "../../../src/application/crm/investor-sales.js";
import { GetMyPortfolio } from "../../../src/application/portfolio/get-my-portfolio.js";
import { GetMyHoldings } from "../../../src/application/transfers/get-holdings.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { Attestation } from "../../../src/domain/attestations/attestation.js";
import { Distribution } from "../../../src/domain/distributions/distribution.js";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { InMemoryAttestationRepository } from "../../fakes/attestation-fakes.js";
import { InMemoryDistributionRepository } from "../../fakes/distribution-fakes.js";
import { FixedClock, InMemoryOfferingRepository } from "../../fakes/offering-fakes.js";
import { FakeTokenEventSource } from "../../fakes/registry-fakes.js";
import { FakeAssetTokenTransferrer } from "../../fakes/transfer-fakes.js";

const NOW = new Date("2026-07-20T12:00:00Z");
const VALUED_AT = new Date("2026-07-01T00:00:00Z");
const PAID_EARLY = new Date("2026-06-10T00:00:00Z");
const PAID_LATE = new Date("2026-07-10T00:00:00Z");

const tokenized = (id: string, name: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: `0xTok-${id}`,
  });

const closedOffering = () =>
  Offering.restore({
    id: "off-1",
    assetId: "asset-1",
    tokenAddress: "0xTok-asset-1",
    supply: 100n,
    priceRial: 1000n,
    minPerInvestor: 1n,
    maxPerInvestor: 100n,
    minimumRaise: 1n,
    opensAt: new Date("2026-06-01T00:00:00Z"),
    closesAt: new Date("2026-06-05T00:00:00Z"),
    state: "closed_success",
    subscriptions: [{ investorId: "sara", tokens: 45n }],
    allocations: [
      { investorId: "sara", requested: 45n, allocated: 45n, costRial: 45_000n, refundRial: 0n },
    ],
  });

const valuation = (validUntil: Date) =>
  Attestation.issue({
    id: "att-1",
    assetId: "asset-1",
    kind: "valuation",
    valueRial: 12_500_000_000n,
    attestorId: "attestor-1",
    issuedAt: VALUED_AT,
    validUntil,
    payloadHash: "0xhash",
    signature: "0xsig",
  });

const paidDistribution = (id: string, amount: bigint, paidAt: Date) =>
  Distribution.restore({
    id,
    assetId: "asset-1",
    tokenAddress: "0xTok-asset-1",
    totalAmountRial: amount,
    state: "paid",
    paidAt,
    payouts: [
      { investorId: "sara", tokens: 45n, amountRial: (amount * 45n) / 90n },
      { investorId: "bob", tokens: 45n, amountRial: (amount * 45n) / 90n },
    ],
  });

let assets: InMemoryAssetRepository;
let offerings: InMemoryOfferingRepository;
let attestations: InMemoryAttestationRepository;
let distributions: InMemoryDistributionRepository;
let portfolio: GetMyPortfolio;

beforeEach(async () => {
  assets = new InMemoryAssetRepository();
  offerings = new InMemoryOfferingRepository();
  attestations = new InMemoryAttestationRepository();
  distributions = new InMemoryDistributionRepository();
  const supply = new FakeTokenEventSource();
  const chain = new FakeAssetTokenTransferrer();
  const clock = new FixedClock(NOW);

  await assets.save(tokenized("asset-1", "Vanak Tower SPV"));
  await offerings.save(closedOffering());
  chain.credit("sara", 45n);
  supply.seed("0xTok-asset-1", [], 90n);
  await attestations.save(valuation(new Date("2027-01-01T00:00:00Z")));

  const sales = new GetInvestorSales(
    offerings,
    assets,
    attestations,
    supply,
    new GetMyHoldings(assets, chain),
    clock,
  );
  portfolio = new GetMyPortfolio(sales, distributions, assets);
});

describe("GetMyPortfolio", () => {
  it("reports what was invested and what the holding is worth now", async () => {
    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.totalInvestedRial).toBe("45000");
    // 12.5B × 45 / 90
    expect(view.portfolioValueRial).toBe("6250000000");
    expect(view.portfolioValueFresh).toBe(true);
  });

  it("dates the valuation the value came from, so it is never an unqualified number", async () => {
    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.holdings[0]?.valuedAt).toBe(VALUED_AT.toISOString());
    expect(view.valuedAt).toBe(VALUED_AT.toISOString());
  });

  it("says a value is stale rather than presenting it as current", async () => {
    attestations.clear();
    await attestations.save(valuation(new Date("2026-07-05T00:00:00Z")));

    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.portfolioValueFresh).toBe(false);
    expect(view.holdings[0]?.valuationFresh).toBe(false);
    // The number is still shown — with its date — rather than hidden.
    expect(view.holdings[0]?.valueRial).toBe("6250000000");
  });

  it("totals the income actually received, newest payment first", async () => {
    await distributions.save(paidDistribution("dist-1", 1_000_000n, PAID_EARLY));
    await distributions.save(paidDistribution("dist-2", 2_000_000n, PAID_LATE));

    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.incomeReceivedRial).toBe("1500000"); // 500k + 1M
    expect(view.income.map((item) => item.distributionId)).toEqual(["dist-2", "dist-1"]);
    expect(view.income[0]).toEqual({
      distributionId: "dist-2",
      assetId: "asset-1",
      assetName: "Vanak Tower SPV",
      amountRial: "1000000",
      paidAt: PAID_LATE.toISOString(),
    });
  });

  it("counts only income that was actually paid, not merely declared", async () => {
    // A declared distribution is a promise; it is not money the holder has.
    await distributions.save(
      Distribution.restore({
        id: "dist-declared",
        assetId: "asset-1",
        tokenAddress: "0xTok-asset-1",
        totalAmountRial: 9_000_000n,
        state: "declared",
        payouts: [{ investorId: "sara", tokens: 45n, amountRial: 4_500_000n }],
      }),
    );

    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.incomeReceivedRial).toBe("0");
    expect(view.income).toEqual([]);
  });

  it("leaves out other people's payouts", async () => {
    await distributions.save(paidDistribution("dist-1", 1_000_000n, PAID_EARLY));

    const view = await portfolio.execute({ investorId: "bob-only" });

    expect(view.incomeReceivedRial).toBe("0");
    expect(view.income).toEqual([]);
  });

  it("shows what share of the portfolio each holding is", async () => {
    const view = await portfolio.execute({ investorId: "sara" });

    // One valued holding is the whole portfolio.
    expect(view.holdings[0]?.shareBasisPoints).toBe(10_000);
  });

  it("leaves the share out when there is nothing to take a share of", async () => {
    // An unvalued portfolio has no denominator; inventing 100% would be a lie.
    attestations.clear();

    const view = await portfolio.execute({ investorId: "sara" });

    expect(view.portfolioValueRial).toBe("0");
    expect(view.holdings[0]?.shareBasisPoints).toBeUndefined();
    expect(view.holdings[0]?.valueRial).toBeUndefined();
  });

  it("is empty, not broken, for an investor who holds nothing", async () => {
    const view = await portfolio.execute({ investorId: "nobody" });

    expect(view.holdings).toEqual([]);
    expect(view.income).toEqual([]);
    expect(view.totalInvestedRial).toBe("0");
    expect(view.portfolioValueRial).toBe("0");
    expect(view.incomeReceivedRial).toBe("0");
    expect(view.valuedAt).toBeUndefined();
  });

  it("carries the subscription history the investor already had", async () => {
    // Reused from the existing sales read model rather than recomputed.
    const view = await portfolio.execute({ investorId: "sara" });
    expect(view.subscriptions.map((s) => s.offeringId)).toEqual(["off-1"]);
  });
});
