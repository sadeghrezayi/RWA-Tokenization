import { describe, expect, it } from "vitest";
import { DeclareDistribution } from "../../../src/application/distributions/declare-distribution.js";
import { PayDistribution } from "../../../src/application/distributions/pay-distribution.js";
import {
  GetDistribution,
  ListDistributions,
} from "../../../src/application/distributions/get-distribution.js";
import {
  AssetNotTokenizedForDistributionError,
  DistributionNotFoundError,
  NoHoldersError,
} from "../../../src/application/distributions/errors.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InMemoryAssetRepository, RecordingAssetEventLog } from "../../fakes/asset-fakes.js";
import { InMemoryInvestorRepository, SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import {
  InMemoryDistributionRepository,
  RecordingDistributionLedger,
  StubHolderSnapshotProvider,
} from "../../fakes/distribution-fakes.js";

const ACTOR = "officer-1";

const tokenizedAsset = (id = "asset-1") =>
  Asset.restore({
    id,
    name: "Pilot Real Estate SPV",
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: "0xToken1",
  });

const setup = async () => {
  const distributions = new InMemoryDistributionRepository();
  const assets = new InMemoryAssetRepository();
  const snapshots = new StubHolderSnapshotProvider([
    { investorId: "a", tokens: 67n },
    { investorId: "b", tokens: 33n },
  ]);
  const ledger = new RecordingDistributionLedger();
  const events = new RecordingAssetEventLog();
  const investors = new InMemoryInvestorRepository();
  await assets.save(tokenizedAsset());
  for (const id of ["a", "b"]) {
    await investors.save(
      Investor.restore(
        id,
        EmailAddress.of(`${id}@example.com`),
        PasswordHash.of("hashed:pw"),
        KycStatus.restore("approved"),
      ),
    );
  }
  return {
    distributions,
    assets,
    snapshots,
    ledger,
    events,
    declare: new DeclareDistribution(
      distributions,
      assets,
      snapshots,
      new SequentialIdGenerator(),
      events,
    ),
    pay: new PayDistribution(distributions, ledger, events),
    get: new GetDistribution(distributions, assets, investors),
    list: new ListDistributions(distributions, assets),
  };
};

describe("DeclareDistribution", () => {
  it("captures_the_snapshot_and_computes_pro_rata_payouts", async () => {
    const s = await setup();

    const { distributionId } = await s.declare.execute({
      assetId: "asset-1",
      totalAmountRial: 100_000n,
      actor: ACTOR,
    });

    const view = await s.get.execute({ distributionId });
    expect(view.state).toBe("declared");
    expect(view.assetName).toBe("Pilot Real Estate SPV");
    expect(view.totalAmountRial).toBe("100000");
    expect(view.payouts).toEqual([
      { investorId: "a", email: "a@example.com", tokens: "67", amountRial: "67000" },
      { investorId: "b", email: "b@example.com", tokens: "33", amountRial: "33000" },
    ]);
    expect(view.reconciliation).toEqual({
      declared: "100000",
      allocated: "100000",
      balanced: true,
    });
    expect(s.events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "distribution_declared",
      actor: ACTOR,
    });
    // Declaration alone credits nothing — payout is a separate approved step.
    expect(s.ledger.credited).toEqual([]);
  });

  it("rejects_an_asset_that_is_not_tokenized", async () => {
    const s = await setup();
    await s.assets.save(
      Asset.restore({
        id: "asset-2",
        name: "Other",
        type: "asset_backed",
        state: "approved",
        dossier: LegalDossier.empty(),
        checklist: OnboardingChecklist.empty(),
        custody: undefined,
      }),
    );
    await expect(
      s.declare.execute({ assetId: "asset-2", totalAmountRial: 1_000n, actor: ACTOR }),
    ).rejects.toThrow(AssetNotTokenizedForDistributionError);
  });

  it("rejects_when_there_are_no_holders", async () => {
    const s = await setup();
    s.snapshots.set([]);
    await expect(
      s.declare.execute({ assetId: "asset-1", totalAmountRial: 1_000n, actor: ACTOR }),
    ).rejects.toThrow(NoHoldersError);
  });
});

describe("PayDistribution (FR-YD-1 payout, FR-YD-2 credit-and-hold)", () => {
  it("credits_each_holder_their_pro_rata_share_and_marks_paid", async () => {
    const s = await setup();
    const { distributionId } = await s.declare.execute({
      assetId: "asset-1",
      totalAmountRial: 100_000n,
      actor: ACTOR,
    });

    const result = await s.pay.execute({ distributionId, actor: ACTOR });

    expect(result.state).toBe("paid");
    expect(s.ledger.credited).toEqual([
      { investorId: "a", amountRial: 67_000n },
      { investorId: "b", amountRial: 33_000n },
    ]);
    expect((await s.get.execute({ distributionId })).state).toBe("paid");
    expect(s.events.events.map((e) => e.event)).toContain("distribution_paid");
  });

  it("rejects_paying_a_distribution_twice", async () => {
    const s = await setup();
    const { distributionId } = await s.declare.execute({
      assetId: "asset-1",
      totalAmountRial: 100_000n,
      actor: ACTOR,
    });
    await s.pay.execute({ distributionId, actor: ACTOR });

    await expect(s.pay.execute({ distributionId, actor: ACTOR })).rejects.toThrow(/state "paid"/);
    // No double credit.
    expect(s.ledger.credited).toHaveLength(2);
  });

  it("throws_for_an_unknown_distribution", async () => {
    const s = await setup();
    await expect(s.pay.execute({ distributionId: "missing", actor: ACTOR })).rejects.toThrow(
      DistributionNotFoundError,
    );
  });
});

describe("ListDistributions", () => {
  it("lists_declared_distributions_as_views", async () => {
    const s = await setup();
    await s.declare.execute({ assetId: "asset-1", totalAmountRial: 100_000n, actor: ACTOR });
    await s.declare.execute({ assetId: "asset-1", totalAmountRial: 50_000n, actor: ACTOR });

    const views = await s.list.execute();
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.totalAmountRial).sort()).toEqual(["100000", "50000"]);
  });
});
