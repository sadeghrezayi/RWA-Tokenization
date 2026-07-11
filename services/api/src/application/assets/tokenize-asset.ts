import { InvalidAssetTransitionError } from "../../domain/assets/errors.js";
import { InvalidTokenSymbolError } from "./errors.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository, AssetTokenDeployer } from "./ports.js";

// Engineering default pending a product ticker policy.
const SYMBOL_PATTERN = /^[A-Z0-9]{2,11}$/;

// FR-AO → FR-SC bridge: deploys the per-asset permissioned token and moves the
// asset to `tokenized`. Deployment is expensive, so the state gate runs first;
// if the save fails after deployment, re-running deploys a fresh suite (the
// orphan is inert — acceptable on the devnet, revisited with Besu runbooks).
export class TokenizeAsset {
  constructor(
    private readonly assets: AssetRepository,
    private readonly deployer: AssetTokenDeployer,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    symbol: string;
    actor: string;
  }): Promise<{ tokenAddress: string }> {
    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.state !== "approved") {
      throw new InvalidAssetTransitionError(
        `cannot mark tokenized an asset in state "${asset.state}"`,
      );
    }
    if (!SYMBOL_PATTERN.test(input.symbol)) {
      throw new InvalidTokenSymbolError();
    }

    const { tokenAddress } = await this.deployer.deployAssetToken({
      assetId: asset.id,
      name: asset.name,
      symbol: input.symbol,
    });
    await this.assets.save(asset.markTokenized(tokenAddress));
    await this.events.append({
      assetId: asset.id,
      event: "asset_tokenized",
      actor: input.actor,
      details: { tokenAddress, symbol: input.symbol },
    });
    return { tokenAddress };
  }
}
