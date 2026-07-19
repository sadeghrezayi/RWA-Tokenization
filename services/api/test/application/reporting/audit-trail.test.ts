import { describe, expect, it } from "vitest";
import { GetAuditTrail } from "../../../src/application/reporting/audit-trail.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";
import { InMemoryAssetEventStore } from "../../fakes/registry-fakes.js";

const T0 = new Date("2026-07-01T00:00:00Z");
const T1 = new Date("2026-07-02T00:00:00Z");
const T2 = new Date("2026-07-03T00:00:00Z");

const asset = (id: string, name: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: "0xTok1",
  });

const setup = async () => {
  const clock = new FixedClock(T0);
  const events = new InMemoryAssetEventStore(clock);
  const assets = new InMemoryAssetRepository();
  const investors = new InMemoryInvestorRepository();
  await assets.save(asset("asset-1", "Vanak Tower SPV"));
  await assets.save(asset("asset-2", "Gold Vault SPV"));
  await investors.save(
    Investor.restore(
      "sara",
      EmailAddress.of("sara@demo.com"),
      PasswordHash.of("hashed:pw"),
      KycStatus.restore("approved"),
    ),
  );

  await events.append({ assetId: "asset-1", event: "asset_proposed", actor: "officer-1" });
  clock.current = T1;
  await events.append({
    assetId: "asset-2",
    event: "tokens_transferred",
    actor: "sara",
    details: { to: "bob", tokens: "15" },
  });
  clock.current = T2;
  await events.append({
    assetId: "asset-1",
    event: "attestation_published",
    actor: "officer-1",
    details: { kind: "valuation" },
  });

  return { clock, events, trail: new GetAuditTrail(events, assets, investors) };
};

describe("GetAuditTrail (FR-RA-2)", () => {
  it("lists_privileged_actions_newest_first_with_names_and_timestamps", async () => {
    const s = await setup();

    const trail = await s.trail.execute({});

    expect(trail).toEqual([
      {
        id: "3",
        assetId: "asset-1",
        assetName: "Vanak Tower SPV",
        event: "attestation_published",
        actor: "officer-1",
        details: { kind: "valuation" },
        at: T2.toISOString(),
      },
      {
        id: "2",
        assetId: "asset-2",
        assetName: "Gold Vault SPV",
        event: "tokens_transferred",
        actor: "sara@demo.com",
        details: { to: "bob", tokens: "15" },
        at: T1.toISOString(),
      },
      {
        id: "1",
        assetId: "asset-1",
        assetName: "Vanak Tower SPV",
        event: "asset_proposed",
        actor: "officer-1",
        details: {},
        at: T0.toISOString(),
      },
    ]);
  });

  it("filters_by_asset", async () => {
    const s = await setup();

    const trail = await s.trail.execute({ assetId: "asset-2" });

    expect(trail).toHaveLength(1);
    expect(trail[0]?.event).toBe("tokens_transferred");
  });

  it("respects_an_explicit_limit_keeping_the_newest", async () => {
    const s = await setup();

    const trail = await s.trail.execute({ limit: 2 });

    expect(trail.map((e) => e.id)).toEqual(["3", "2"]);
  });

  it("falls_back_to_the_raw_asset_id_when_the_asset_is_unknown", async () => {
    const s = await setup();
    await s.events.append({ assetId: "ghost", event: "asset_retired", actor: "officer-1" });

    const trail = await s.trail.execute({ assetId: "ghost" });

    expect(trail[0]?.assetName).toBe("ghost");
  });
});
