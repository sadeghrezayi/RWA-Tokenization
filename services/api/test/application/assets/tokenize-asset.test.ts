import { describe, expect, it } from "vitest";
import { TokenizeAsset } from "../../../src/application/assets/tokenize-asset.js";
import {
  AssetNotFoundError,
  InvalidTokenSymbolError,
} from "../../../src/application/assets/errors.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { CustodyArrangement } from "../../../src/domain/assets/custody-arrangement.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { InvalidAssetTransitionError } from "../../../src/domain/assets/errors.js";
import {
  InMemoryAssetRepository,
  RecordingAssetEventLog,
  RecordingTokenDeployer,
} from "../../fakes/asset-fakes.js";

const ACTOR = "officer-1";

const assetIn = (state: "approved" | "in_structuring") =>
  Asset.restore({
    id: "asset-1",
    name: "Pilot Real Estate SPV",
    type: "asset_backed",
    state,
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: CustodyArrangement.of({ custodianName: "Trust Co.", location: "Vault 12" }),
  });

const setup = async (state: "approved" | "in_structuring" = "approved") => {
  const assets = new InMemoryAssetRepository();
  const deployer = new RecordingTokenDeployer();
  const events = new RecordingAssetEventLog();
  await assets.save(assetIn(state));
  return { assets, deployer, events, tokenize: new TokenizeAsset(assets, deployer, events) };
};

describe("TokenizeAsset", () => {
  it("deploys_the_token_and_marks_the_asset_tokenized", async () => {
    const { assets, deployer, events, tokenize } = await setup();

    const result = await tokenize.execute({ assetId: "asset-1", symbol: "PRES", actor: ACTOR });

    expect(result.tokenAddress).toBe("0xDeployed1");
    const stored = await assets.findById("asset-1");
    expect(stored?.state).toBe("tokenized");
    expect(stored?.tokenAddress).toBe("0xDeployed1");
    expect(deployer.deployed).toEqual([
      { assetId: "asset-1", name: "Pilot Real Estate SPV", symbol: "PRES" },
    ]);
    expect(events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "asset_tokenized",
      actor: ACTOR,
      details: { tokenAddress: "0xDeployed1", symbol: "PRES" },
    });
  });

  it("rejects_a_non_approved_asset_without_deploying", async () => {
    const { deployer, tokenize } = await setup("in_structuring");

    await expect(
      tokenize.execute({ assetId: "asset-1", symbol: "PRES", actor: ACTOR }),
    ).rejects.toThrow(InvalidAssetTransitionError);
    expect(deployer.deployed).toEqual([]);
  });

  it.each(["", "pres", "P", "TOOLONGSYMBOL", "PR ES"])(
    "rejects_invalid_symbol_%j_without_deploying",
    async (symbol) => {
      const { deployer, tokenize } = await setup();
      await expect(tokenize.execute({ assetId: "asset-1", symbol, actor: ACTOR })).rejects.toThrow(
        InvalidTokenSymbolError,
      );
      expect(deployer.deployed).toEqual([]);
    },
  );

  it("throws_for_an_unknown_asset", async () => {
    const { tokenize } = await setup();
    await expect(
      tokenize.execute({ assetId: "missing", symbol: "PRES", actor: ACTOR }),
    ).rejects.toThrow(AssetNotFoundError);
  });

  it("keeps_the_asset_approved_when_deployment_fails", async () => {
    const { assets, deployer, tokenize } = await setup();
    deployer.failWith = new Error("devnet unreachable");

    await expect(
      tokenize.execute({ assetId: "asset-1", symbol: "PRES", actor: ACTOR }),
    ).rejects.toThrow("devnet unreachable");
    expect((await assets.findById("asset-1"))?.state).toBe("approved");
  });
});
