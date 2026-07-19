import { describe, expect, it } from "vitest";
import { GetMyHoldings } from "../../../src/application/transfers/get-holdings.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { FakeAssetTokenTransferrer } from "../../fakes/transfer-fakes.js";

const asset = (id: string, name: string, state: "tokenized" | "proposed", tokenAddress?: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state,
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    ...(tokenAddress !== undefined ? { tokenAddress } : {}),
  });

describe("GetMyHoldings", () => {
  it("lists_only_tokenized_assets_where_the_investor_holds_tokens", async () => {
    const assets = new InMemoryAssetRepository();
    await assets.save(asset("a1", "Vanak Tower SPV", "tokenized", "0xTok1"));
    await assets.save(asset("a2", "Empty SPV", "tokenized", "0xTok2"));
    await assets.save(asset("a3", "Draft Plot", "proposed"));
    const chain = new FakeAssetTokenTransferrer();
    chain.credit("alice", 42n);

    const holdings = await new GetMyHoldings(assets, chain).execute({ investorId: "alice" });

    // The fake keys balances by investor only, so both tokenized assets report
    // 42 — the point pinned here: non-tokenized assets are skipped and amounts
    // serialize as strings with names attached.
    expect(holdings).toEqual([
      { assetId: "a1", assetName: "Vanak Tower SPV", tokenAddress: "0xTok1", tokens: "42" },
      { assetId: "a2", assetName: "Empty SPV", tokenAddress: "0xTok2", tokens: "42" },
    ]);
  });

  it("omits_assets_with_zero_balance", async () => {
    const assets = new InMemoryAssetRepository();
    await assets.save(asset("a1", "Vanak Tower SPV", "tokenized", "0xTok1"));

    const holdings = await new GetMyHoldings(assets, new FakeAssetTokenTransferrer()).execute({
      investorId: "nobody",
    });
    expect(holdings).toEqual([]);
  });
});
