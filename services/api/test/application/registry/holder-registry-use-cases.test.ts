import { describe, expect, it } from "vitest";
import { GetHolderRegistry } from "../../../src/application/registry/get-holder-registry.js";
import {
  csvField,
  ExportHolderRegistryCsv,
  ExportTransferHistoryCsv,
} from "../../../src/application/registry/export-csv.js";
import { AssetNotFoundError } from "../../../src/application/assets/errors.js";
import { AssetNotTokenizedForRegistryError } from "../../../src/application/registry/errors.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import type { RegistryEvent } from "../../../src/domain/registry/holder-registry.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { FakeTokenEventSource, InMemoryWalletDirectory } from "../../fakes/registry-fakes.js";

const T0 = new Date("2026-07-01T00:00:00Z");
const T1 = new Date("2026-07-02T00:00:00Z");
const T2 = new Date("2026-07-03T00:00:00Z");

const SARA = "0xAAA1";
const BOB = "0xBBB2";

const asset = (id: string, state: "tokenized" | "approved", tokenAddress?: string) =>
  Asset.restore({
    id,
    name: "Vanak Tower SPV",
    type: "asset_backed",
    state,
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    ...(tokenAddress !== undefined ? { tokenAddress } : {}),
  });

const goldenStream: RegistryEvent[] = [
  { kind: "mint", to: SARA, tokens: 60n, at: T0, ref: "0xm1" },
  { kind: "mint", to: BOB, tokens: 40n, at: T0, ref: "0xm2" },
  { kind: "transfer", from: SARA, to: BOB, tokens: 15n, at: T1, ref: "0xt1" },
  { kind: "burn", from: SARA, tokens: 10n, at: T2, ref: "0xb1" },
];

const setup = async () => {
  const assets = new InMemoryAssetRepository();
  const chain = new FakeTokenEventSource();
  const wallets = new InMemoryWalletDirectory();
  await assets.save(asset("asset-1", "tokenized", "0xTok1"));
  await assets.save(asset("asset-2", "approved"));
  // Directory keys are lowercase by contract; events arrive checksummed.
  wallets.register(SARA, { investorId: "sara", email: "sara@demo.com" });
  wallets.register(BOB, { investorId: "bob", email: "bob@demo.com" });
  const registry = new GetHolderRegistry(assets, chain, wallets);
  return {
    assets,
    chain,
    wallets,
    registry,
    exportRegistry: new ExportHolderRegistryCsv(registry),
    exportHistory: new ExportTransferHistoryCsv(registry),
  };
};

describe("GetHolderRegistry (FR-RA-1)", () => {
  it("rebuilds_holders_from_chain_events_named_as_people", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", goldenStream, 90n);

    const view = await s.registry.execute({ assetId: "asset-1" });

    expect(view.assetId).toBe("asset-1");
    expect(view.assetName).toBe("Vanak Tower SPV");
    expect(view.tokenAddress).toBe("0xTok1");
    expect(view.holders).toEqual([
      {
        wallet: "0xbbb2",
        tokens: "55",
        since: T0.toISOString(),
        shareBps: 6111,
        investorId: "bob",
        email: "bob@demo.com",
      },
      {
        wallet: "0xaaa1",
        tokens: "35",
        since: T0.toISOString(),
        shareBps: 3888,
        investorId: "sara",
        email: "sara@demo.com",
      },
    ]);
    expect(view.registryTotal).toBe("90");
    expect(view.onChainSupply).toBe("90");
    expect(view.matchesChain).toBe(true);
  });

  it("maps_the_full_history_to_emails_with_chain_refs", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", goldenStream, 90n);

    const view = await s.registry.execute({ assetId: "asset-1" });

    expect(view.history).toEqual([
      { kind: "mint", to: "sara@demo.com", tokens: "60", at: T0.toISOString(), ref: "0xm1" },
      { kind: "mint", to: "bob@demo.com", tokens: "40", at: T0.toISOString(), ref: "0xm2" },
      {
        kind: "transfer",
        from: "sara@demo.com",
        to: "bob@demo.com",
        tokens: "15",
        at: T1.toISOString(),
        ref: "0xt1",
      },
      { kind: "burn", from: "sara@demo.com", tokens: "10", at: T2.toISOString(), ref: "0xb1" },
    ]);
  });

  it("surfaces_wallets_outside_the_directory_instead_of_hiding_them", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", [{ kind: "mint", to: "0xDEAD", tokens: 10n, at: T0, ref: "0xm9" }], 10n);

    const view = await s.registry.execute({ assetId: "asset-1" });

    expect(view.holders).toEqual([
      { wallet: "0xdead", tokens: "10", since: T0.toISOString(), shareBps: 10000 },
    ]);
    expect(view.history[0]?.to).toBe("0xdead");
  });

  it("flags_a_mismatch_between_registry_total_and_on_chain_supply", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", [{ kind: "mint", to: SARA, tokens: 60n, at: T0, ref: "0xm1" }], 55n);

    const view = await s.registry.execute({ assetId: "asset-1" });

    expect(view.matchesChain).toBe(false);
    expect(view.registryTotal).toBe("60");
    expect(view.onChainSupply).toBe("55");
  });

  it("rejects_an_unknown_asset", async () => {
    const s = await setup();
    await expect(s.registry.execute({ assetId: "missing" })).rejects.toThrow(AssetNotFoundError);
  });

  it("rejects_an_asset_without_a_token", async () => {
    const s = await setup();
    await expect(s.registry.execute({ assetId: "asset-2" })).rejects.toThrow(
      AssetNotTokenizedForRegistryError,
    );
  });

  it("is_empty_but_consistent_for_a_token_with_no_events", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", [], 0n);

    const view = await s.registry.execute({ assetId: "asset-1" });

    expect(view.holders).toEqual([]);
    expect(view.history).toEqual([]);
    expect(view.matchesChain).toBe(true);
    expect(view.registryTotal).toBe("0");
  });
});

describe("csvField (RFC 4180 escaping)", () => {
  it("passes_plain_values_through", () => {
    expect(csvField("sara@demo.com")).toBe("sara@demo.com");
  });

  it("quotes_commas_quotes_and_newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("ExportHolderRegistryCsv (FR-RA-1 export)", () => {
  it("exports_the_holder_rows_in_registry_order", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", goldenStream, 90n);

    const { filename, csv } = await s.exportRegistry.execute({ assetId: "asset-1" });

    expect(filename).toBe("holder-registry-asset-1.csv");
    expect(csv).toBe(
      [
        "email,investor_id,wallet,tokens,holder_since",
        `bob@demo.com,bob,0xbbb2,55,${T0.toISOString()}`,
        `sara@demo.com,sara,0xaaa1,35,${T0.toISOString()}`,
      ].join("\n"),
    );
  });

  it("leaves_identity_columns_empty_for_unknown_wallets_and_escapes_fields", async () => {
    const s = await setup();
    s.wallets.register("0xCCC3", { investorId: "carol", email: 'carol,"c"@demo.com' });
    s.chain.seed(
      "0xTok1",
      [
        { kind: "mint", to: "0xDEAD", tokens: 10n, at: T0, ref: "0xm9" },
        { kind: "mint", to: "0xCCC3", tokens: 5n, at: T0, ref: "0xm10" },
      ],
      15n,
    );

    const { csv } = await s.exportRegistry.execute({ assetId: "asset-1" });

    expect(csv).toContain(`,,0xdead,10,${T0.toISOString()}`);
    expect(csv).toContain(`"carol,""c""@demo.com",carol,0xccc3,5,${T0.toISOString()}`);
  });
});

describe("ExportTransferHistoryCsv (FR-RA-1 full history)", () => {
  it("exports_every_chain_event_with_its_tx_reference", async () => {
    const s = await setup();
    s.chain.seed("0xTok1", goldenStream, 90n);

    const { filename, csv } = await s.exportHistory.execute({ assetId: "asset-1" });

    expect(filename).toBe("transfer-history-asset-1.csv");
    expect(csv).toBe(
      [
        "at,kind,from,to,tokens,tx",
        `${T0.toISOString()},mint,,sara@demo.com,60,0xm1`,
        `${T0.toISOString()},mint,,bob@demo.com,40,0xm2`,
        `${T1.toISOString()},transfer,sara@demo.com,bob@demo.com,15,0xt1`,
        `${T2.toISOString()},burn,sara@demo.com,,10,0xb1`,
      ].join("\n"),
    );
  });
});
