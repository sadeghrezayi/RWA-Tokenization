import { describe, expect, it } from "vitest";
import { GetInvestorSales } from "../../../src/application/crm/investor-sales.js";
import { GetInvestorTimeline } from "../../../src/application/crm/investor-timeline.js";
import { GetMyHoldings } from "../../../src/application/transfers/get-holdings.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { Attestation } from "../../../src/domain/attestations/attestation.js";
import { CrmNote } from "../../../src/domain/crm/crm-note.js";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { InMemoryAttestationRepository } from "../../fakes/attestation-fakes.js";
import { InMemoryCrmNoteRepository } from "../../fakes/crm-fakes.js";
import { FixedClock, InMemoryOfferingRepository } from "../../fakes/offering-fakes.js";
import { FakeTokenEventSource, InMemoryAssetEventStore } from "../../fakes/registry-fakes.js";
import { FakeAssetTokenTransferrer } from "../../fakes/transfer-fakes.js";

const NOW = new Date("2026-07-20T12:00:00Z");
const T1 = new Date("2026-07-10T00:00:00Z");
const T2 = new Date("2026-07-15T00:00:00Z");

const tokenizedAsset = (id: string, name: string) =>
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
    opensAt: new Date("2026-07-01T00:00:00Z"),
    closesAt: T1,
    state: "closed_success",
    subscriptions: [{ investorId: "sara", tokens: 60n }],
    allocations: [
      { investorId: "sara", requested: 60n, allocated: 60n, costRial: 60_000n, refundRial: 0n },
      { investorId: "bob", requested: 40n, allocated: 40n, costRial: 40_000n, refundRial: 0n },
    ],
  });

const openOffering = () =>
  Offering.restore({
    id: "off-2",
    assetId: "asset-1",
    tokenAddress: "0xTok-asset-1",
    supply: 50n,
    priceRial: 2000n,
    minPerInvestor: 1n,
    maxPerInvestor: 50n,
    minimumRaise: 1n,
    opensAt: T1,
    closesAt: new Date("2026-08-01T00:00:00Z"),
    state: "open",
    subscriptions: [{ investorId: "sara", tokens: 10n }],
    allocations: undefined,
  });

const valuation = (validUntil: Date) =>
  Attestation.issue({
    id: "att-1",
    assetId: "asset-1",
    kind: "valuation",
    valueRial: 12_500_000_000n,
    attestorId: "attestor-1",
    issuedAt: new Date("2026-07-01T00:00:00Z"),
    validUntil,
    payloadHash: "0xhash",
    signature: "0xsig",
  });

const setup = async () => {
  const assets = new InMemoryAssetRepository();
  const offerings = new InMemoryOfferingRepository();
  const attestations = new InMemoryAttestationRepository();
  const supply = new FakeTokenEventSource();
  const chain = new FakeAssetTokenTransferrer();
  const clock = new FixedClock(NOW);
  await assets.save(tokenizedAsset("asset-1", "Vanak Tower SPV"));
  await offerings.save(closedOffering());
  await offerings.save(openOffering());
  chain.credit("sara", 45n);
  supply.seed("0xTok-asset-1", [], 90n);
  return {
    attestations,
    clock,
    sales: new GetInvestorSales(
      offerings,
      assets,
      attestations,
      supply,
      new GetMyHoldings(assets, chain),
      clock,
    ),
  };
};

describe("GetInvestorSales", () => {
  it("sums_invested_costs_and_values_holdings_at_the_fresh_attested_valuation", async () => {
    const s = await setup();
    await s.attestations.save(valuation(new Date("2027-01-01T00:00:00Z")));

    const view = await s.sales.execute({ investorId: "sara" });

    expect(view.totalInvestedRial).toBe("60000");
    // 12.5B valuation × 45 tokens / 90 supply = 6.25B
    expect(view.portfolioValueRial).toBe("6250000000");
    expect(view.portfolioValueFresh).toBe(true);
    expect(view.holdings).toEqual([
      {
        assetId: "asset-1",
        assetName: "Vanak Tower SPV",
        tokens: "45",
        valueRial: "6250000000",
        valuationFresh: true,
      },
    ]);
  });

  it("lists_subscription_history_newest_close_first_including_open_offerings", async () => {
    const s = await setup();
    await s.attestations.save(valuation(new Date("2027-01-01T00:00:00Z")));

    const { subscriptions } = await s.sales.execute({ investorId: "sara" });

    expect(subscriptions).toEqual([
      expect.objectContaining({
        offeringId: "off-2",
        assetName: "Vanak Tower SPV",
        state: "open",
        requested: "10",
        allocated: "0",
        costRial: "0",
      }),
      expect.objectContaining({
        offeringId: "off-1",
        state: "closed_success",
        requested: "60",
        allocated: "60",
        costRial: "60000",
        refundRial: "0",
      }),
    ]);
  });

  it("marks_the_portfolio_value_stale_when_the_valuation_expired", async () => {
    const s = await setup();
    await s.attestations.save(valuation(new Date("2026-07-15T00:00:00Z"))); // past NOW

    const view = await s.sales.execute({ investorId: "sara" });

    expect(view.portfolioValueRial).toBe("6250000000"); // still computed
    expect(view.portfolioValueFresh).toBe(false);
    expect(view.holdings[0]?.valuationFresh).toBe(false);
  });

  it("degrades_honestly_without_any_valuation", async () => {
    const s = await setup();

    const view = await s.sales.execute({ investorId: "sara" });

    expect(view.portfolioValueRial).toBe("0");
    expect(view.portfolioValueFresh).toBe(false);
    expect(view.holdings[0]?.valueRial).toBeUndefined();
  });

  it("is_all_zeroes_for_an_investor_with_no_activity", async () => {
    const s = await setup();

    const view = await s.sales.execute({ investorId: "nobody" });

    expect(view).toMatchObject({
      totalInvestedRial: "0",
      portfolioValueRial: "0",
      subscriptions: [],
      holdings: [],
    });
  });
});

describe("GetInvestorTimeline", () => {
  it("merges_notes_and_platform_events_newest_first_with_asset_names", async () => {
    const assets = new InMemoryAssetRepository();
    await assets.save(tokenizedAsset("asset-1", "Vanak Tower SPV"));
    const notes = new InMemoryCrmNoteRepository();
    const clock = new FixedClock(T1);
    const events = new InMemoryAssetEventStore(clock);

    await events.append({
      assetId: "asset-1",
      event: "offering_subscribed",
      actor: "sara",
      details: { tokens: "60" },
    });
    await events.append({ assetId: "asset-1", event: "asset_approved", actor: "officer-1" });
    await notes.save(
      CrmNote.write({
        id: "n1",
        investorId: "sara",
        authorId: "officer-1",
        text: "Asked for the dossier.",
        at: T2,
      }),
    );

    const timeline = await new GetInvestorTimeline(notes, events, assets).execute({
      investorId: "sara",
    });

    expect(timeline).toEqual([
      { kind: "note", at: T2.toISOString(), text: "Asked for the dossier.", actor: "officer-1" },
      {
        kind: "event",
        at: T1.toISOString(),
        text: "offering_subscribed",
        actor: "sara",
        assetName: "Vanak Tower SPV",
      },
    ]);
  });
});
