import type { Asset } from "../../domain/assets/asset.js";
import { AssetNotFoundError } from "./errors.js";
import type { AssetRepository } from "./ports.js";

export const loadAsset = async (assets: AssetRepository, assetId: string): Promise<Asset> => {
  const asset = await assets.findById(assetId);
  if (!asset) {
    throw new AssetNotFoundError(assetId);
  }
  return asset;
};
