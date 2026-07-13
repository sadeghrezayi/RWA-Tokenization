import { describe, expect, it } from "vitest";
import { GetAssetOverview } from "../../../src/application/reporting/asset-overview.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { Distribution } from "../../../src/domain/distributions/distribution.js";
import type { HolderShare } from "../../../src/domain/distributions/distribution.js";
import type { HolderSnapshotProvider } from "../../../src/application/distributions/ports.js";
import { Attestation } from "../../../src/domain/attestations/attestation.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { InMemoryOfferingRepository } from "../../fakes/offering-fakes.js";
import { InMemoryDistributionRepository } from "../../fakes/distribution-fakes.js";
import { InMemoryAttestationRepository } from "../../fakes/attestation-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-07-10T00:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");

// Snapshot keyed by token address, so different assets report different holders.
class MapSnapshot implements HolderSnapshotProvider {
  constructor(private readonly byToken: Record<string, HolderShare[]>) {}
  snapshot(tokenAddress: string): Promise<HolderShare[]> {
    return Promise.resolve(this.byToken[tokenAddress] ?? []);
  }
}

const tokenizedAsset = (id: string, name: string, tokenAddress: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress,
  });

const proposedAsset = (id: string, name: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state: "proposed",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
  });

const offering = (id: string, assetId: string, tokenAddress: string) =>
  Offering.create({
    id,
    assetId,
    tokenAddress,
    supply: 100n,
    priceRial: 1_000n,
    minPerInvestor: 5n,
    maxPerInvestor: 100n,
    minimumRaise: 20n,
    opensAt: OPENS,
    closesAt: CLOSES,
  });

describe("GetAssetOverview", () => {
  const setup = async () => {
    const assets = new InMemoryAssetRepository();
    const offerings = new InMemoryOfferingRepository();
    const distributions = new InMemoryDistributionRepository();
    await assets.save(tokenizedAsset("asset-1", "Vanak Tower SPV", "0xTok1"));
    await assets.save(proposedAsset("asset-2", "Draft Land Plot"));

    // asset-1: one successful offering (67 sold @1000), one open offering (30 subscribed).
    await offerings.save(
      offering("off-1", "asset-1", "0xTok1").open(DURING).subscribe("a", 67n, DURING).close(AFTER),
    );
    await offerings.save(
      offering("off-2", "asset-1", "0xTok1").open(DURING).subscribe("b", 30n, DURING),
    );

    // asset-1: one paid distribution of 50,000.
    await distributions.save(
      Distribution.declare({
        id: "dist-1",
        assetId: "asset-1",
        tokenAddress: "0xTok1",
        totalAmountRial: 50_000n,
        snapshot: [{ investorId: "a", tokens: 67n }],
      }).markPaid(),
    );

    // asset-1: a fresh valuation attestation of 9,000,000,000 Rial.
    const attestations = new InMemoryAttestationRepository();
    await attestations.save(
      Attestation.issue({
        id: "att-1",
        assetId: "asset-1",
        kind: "valuation",
        valueRial: 9_000_000_000n,
        attestorId: "attestor-1",
        issuedAt: new Date("2026-07-08T00:00:00Z"),
        validUntil: new Date("2026-10-08T00:00:00Z"),
        payloadHash: "0xhash",
        signature: "0xsig",
      }),
    );

    const snapshots = new MapSnapshot({ "0xTok1": [{ investorId: "a", tokens: 67n }] });
    const clock = new FixedClock(new Date("2026-07-20T00:00:00Z"));
    return {
      overview: new GetAssetOverview(
        assets,
        offerings,
        distributions,
        snapshots,
        attestations,
        clock,
      ),
    };
  };

  it("aggregates_per_asset_supply_holders_offerings_distributions_and_totals", async () => {
    const { overview } = await setup();
    const result = await overview.execute();

    const a1 = result.assets.find((a) => a.id === "asset-1");
    expect(a1).toMatchObject({
      name: "Vanak Tower SPV",
      state: "tokenized",
      tokenAddress: "0xTok1",
      circulatingSupply: "67",
      holderCount: 1,
      totalRaisedRial: "67000",
      totalDistributedRial: "50000",
    });
    expect(a1?.offerings).toHaveLength(2);
    expect(a1?.distributions).toHaveLength(1);
    // FR-OR: latest valuation surfaced with freshness + "as of" (fresh at 2026-07-20).
    expect(a1?.latestValuation).toEqual({
      valueRial: "9000000000",
      asOf: "2026-07-08T00:00:00.000Z",
      validUntil: "2026-10-08T00:00:00.000Z",
      fresh: true,
    });
  });

  it("omits_latest_valuation_for_an_asset_without_one", async () => {
    const { overview } = await setup();
    const result = await overview.execute();
    expect(result.assets.find((a) => a.id === "asset-2")?.latestValuation).toBeUndefined();
  });

  it("reports_a_non_tokenized_asset_with_zero_supply_and_no_holders", async () => {
    const { overview } = await setup();
    const result = await overview.execute();

    const a2 = result.assets.find((a) => a.id === "asset-2");
    expect(a2).toMatchObject({
      state: "proposed",
      circulatingSupply: "0",
      holderCount: 0,
      totalRaisedRial: "0",
      totalDistributedRial: "0",
    });
    expect(a2?.tokenAddress).toBeUndefined();
    expect(a2?.offerings).toEqual([]);
  });

  it("summarizes_the_portfolio", async () => {
    const { overview } = await setup();
    const result = await overview.execute();

    expect(result.summary).toEqual({
      assetCount: 2,
      tokenizedCount: 1,
      totalRaisedRial: "67000",
      totalDistributedRial: "50000",
    });
  });

  it("exposes_offering_progress_as_supply_and_subscribed", async () => {
    const { overview } = await setup();
    const result = await overview.execute();

    const open = result.assets.flatMap((a) => a.offerings).find((o) => o.id === "off-2");
    expect(open).toEqual({
      id: "off-2",
      state: "open",
      supply: "100",
      subscribed: "30",
      priceRial: "1000",
    });
  });
});
