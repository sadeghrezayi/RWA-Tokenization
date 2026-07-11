import { describe, expect, it } from "vitest";
import { CreateOffering } from "../../../src/application/offerings/create-offering.js";
import { OpenOffering } from "../../../src/application/offerings/open-offering.js";
import { SubscribeToOffering } from "../../../src/application/offerings/subscribe-to-offering.js";
import { CloseOffering } from "../../../src/application/offerings/close-offering.js";
import {
  AssetNotTokenizedError,
  InsufficientFundsError,
  InvestorNotEligibleError,
  OfferingNotFoundError,
} from "../../../src/application/offerings/errors.js";
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
  FakeSettlementRail,
  FixedClock,
  InMemoryOfferingRepository,
  RecordingAssetTokenIssuer,
} from "../../fakes/offering-fakes.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-07-10T00:00:00Z");
const AFTER = new Date("2026-07-10T00:00:01Z");
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

const investorIn = (id: string, state: "approved" | "draft") =>
  Investor.restore(
    id,
    EmailAddress.of(`${id}@example.com`),
    PasswordHash.of("hashed:pw"),
    KycStatus.restore(state),
  );

const setup = async () => {
  const offerings = new InMemoryOfferingRepository();
  const assets = new InMemoryAssetRepository();
  const investors = new InMemoryInvestorRepository();
  const rail = new FakeSettlementRail();
  const issuer = new RecordingAssetTokenIssuer();
  const events = new RecordingAssetEventLog();
  const clock = new FixedClock(DURING);
  await assets.save(tokenizedAsset());
  await investors.save(investorIn("inv-1", "approved"));
  await investors.save(investorIn("inv-2", "approved"));
  await investors.save(investorIn("inv-3", "draft"));
  return {
    offerings,
    assets,
    investors,
    rail,
    issuer,
    events,
    clock,
    create: new CreateOffering(offerings, assets, new SequentialIdGenerator(), events),
    open: new OpenOffering(offerings, events, clock),
    subscribe: new SubscribeToOffering(offerings, investors, rail, events, clock),
    close: new CloseOffering(offerings, rail, issuer, events, clock),
  };
};

const CONFIG = {
  assetId: "asset-1",
  supply: 100n,
  priceRial: 1_000n,
  minPerInvestor: 5n,
  maxPerInvestor: 80n,
  minimumRaise: 20n,
  opensAt: OPENS,
  closesAt: CLOSES,
  actor: ACTOR,
};

const createOpen = async (s: Awaited<ReturnType<typeof setup>>) => {
  const { offeringId } = await s.create.execute(CONFIG);
  await s.open.execute({ offeringId, actor: ACTOR });
  return offeringId;
};

describe("CreateOffering", () => {
  it("persists_a_draft_offering_bound_to_the_asset_token_and_logs", async () => {
    const s = await setup();
    const { offeringId } = await s.create.execute(CONFIG);

    const stored = await s.offerings.findById(offeringId);
    expect(stored?.state).toBe("draft");
    expect(stored?.tokenAddress).toBe("0xToken1");
    expect(s.events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "offering_created",
      actor: ACTOR,
    });
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
    await expect(s.create.execute({ ...CONFIG, assetId: "asset-2" })).rejects.toThrow(
      AssetNotTokenizedError,
    );
  });
});

describe("SubscribeToOffering", () => {
  it("holds_the_cost_on_the_ledger_and_persists_the_subscription", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-1", 50_000n);

    await s.subscribe.execute({ offeringId, investorId: "inv-1", tokens: 30n });

    expect(s.rail.held.get("inv-1")).toBe(30_000n);
    expect(s.rail.balances.get("inv-1")).toBe(20_000n);
    expect((await s.offerings.findById(offeringId))?.subscriptions).toEqual([
      { investorId: "inv-1", tokens: 30n },
    ]);
  });

  it("rejects_an_investor_without_approved_kyc", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-3", 50_000n);

    await expect(
      s.subscribe.execute({ offeringId, investorId: "inv-3", tokens: 10n }),
    ).rejects.toThrow(InvestorNotEligibleError);
    expect(s.rail.held.get("inv-3")).toBeUndefined();
  });

  it("rejects_insufficient_funds_without_recording_the_subscription", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-1", 5_000n);

    await expect(
      s.subscribe.execute({ offeringId, investorId: "inv-1", tokens: 10n }),
    ).rejects.toThrow(InsufficientFundsError);
    expect((await s.offerings.findById(offeringId))?.subscriptions).toEqual([]);
  });

  it("releases_the_hold_when_persistence_fails", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-1", 50_000n);
    s.offerings.failNextSave = new Error("db down");

    await expect(
      s.subscribe.execute({ offeringId, investorId: "inv-1", tokens: 30n }),
    ).rejects.toThrow("db down");
    expect(s.rail.held.get("inv-1")).toBe(0n);
    expect(s.rail.balances.get("inv-1")).toBe(50_000n);
  });

  it("throws_for_an_unknown_offering", async () => {
    const s = await setup();
    await expect(
      s.subscribe.execute({ offeringId: "missing", investorId: "inv-1", tokens: 10n }),
    ).rejects.toThrow(OfferingNotFoundError);
  });
});

describe("CloseOffering (FR-PI-3 both paths)", () => {
  it("failed_raise_releases_every_hold_and_mints_nothing", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-1", 10_000n);
    await s.subscribe.execute({ offeringId, investorId: "inv-1", tokens: 10n });
    s.clock.current = AFTER;

    const result = await s.close.execute({ offeringId, actor: ACTOR });

    expect(result.state).toBe("closed_failed");
    expect(s.rail.held.get("inv-1")).toBe(0n);
    expect(s.rail.balances.get("inv-1")).toBe(10_000n);
    expect(s.rail.captured.size).toBe(0);
    expect(s.issuer.minted).toEqual([]);
    expect(s.issuer.finalized).toEqual([]);
  });

  it("successful_close_captures_costs_refunds_excess_mints_pro_rata_and_finalizes", async () => {
    const s = await setup();
    const offeringId = await createOpen(s);
    s.rail.credit("inv-1", 80_000n);
    s.rail.credit("inv-2", 40_000n);
    await s.subscribe.execute({ offeringId, investorId: "inv-1", tokens: 80n });
    await s.subscribe.execute({ offeringId, investorId: "inv-2", tokens: 40n });
    s.clock.current = AFTER;

    const result = await s.close.execute({ offeringId, actor: ACTOR });

    expect(result.state).toBe("closed_success");
    // supply 100, demand 120 → 67 / 33 (deterministic remainder to inv-1)
    expect(s.rail.captured.get("inv-1")).toBe(67_000n);
    expect(s.rail.captured.get("inv-2")).toBe(33_000n);
    expect(s.rail.balances.get("inv-1")).toBe(13_000n);
    expect(s.rail.balances.get("inv-2")).toBe(7_000n);
    expect(s.rail.held.get("inv-1")).toBe(0n);
    expect(s.rail.held.get("inv-2")).toBe(0n);
    expect(s.issuer.minted).toEqual([
      { tokenAddress: "0xToken1", investorId: "inv-1", tokens: 67n },
      { tokenAddress: "0xToken1", investorId: "inv-2", tokens: 33n },
    ]);
    expect(s.issuer.finalized).toEqual(["0xToken1"]);
    expect(s.events.events.map((e) => e.event)).toContain("offering_closed");
    expect((await s.offerings.findById(offeringId))?.state).toBe("closed_success");
  });

  it("throws_for_an_unknown_offering", async () => {
    const s = await setup();
    await expect(s.close.execute({ offeringId: "missing", actor: ACTOR })).rejects.toThrow(
      OfferingNotFoundError,
    );
  });
});
