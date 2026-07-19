import type { AssetRepository } from "../assets/ports.js";
import type { AssetTokenTransferrer } from "./ports.js";

// FR-TR / FR-PT-1: what the investor actually holds, read from the chain (the
// source of truth — survives transfers and redemptions).
export interface HoldingView {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  tokens: string;
}

export class GetMyHoldings {
  constructor(
    private readonly assets: AssetRepository,
    private readonly chain: AssetTokenTransferrer,
  ) {}

  async execute(input: { investorId: string }): Promise<HoldingView[]> {
    const assets = await this.assets.findAll();
    const holdings: HoldingView[] = [];
    for (const asset of assets) {
      if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
        continue;
      }
      const tokens = await this.chain.balanceOf(asset.tokenAddress, input.investorId);
      if (tokens > 0n) {
        holdings.push({
          assetId: asset.id,
          assetName: asset.name,
          tokenAddress: asset.tokenAddress,
          tokens: String(tokens),
        });
      }
    }
    return holdings;
  }
}
