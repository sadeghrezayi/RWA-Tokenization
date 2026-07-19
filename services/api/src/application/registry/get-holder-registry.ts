import { HolderRegistry } from "../../domain/registry/holder-registry.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetRepository } from "../assets/ports.js";
import { AssetNotTokenizedForRegistryError } from "./errors.js";
import type { TokenEventSource, WalletDirectory } from "./ports.js";

// FR-RA-1 / §14 step 8: the holder registry rebuilt from chain events and
// reconciled against the live on-chain supply, with wallets mapped to people
// (P2). Unknown wallets stay visible as addresses — never silently dropped.
export interface RegistryHolderView {
  wallet: string;
  tokens: string;
  since: string;
  shareBps: number;
  investorId?: string;
  email?: string;
}

export interface RegistryEventView {
  kind: "mint" | "transfer" | "burn";
  tokens: string;
  at: string;
  ref: string;
  from?: string;
  to?: string;
}

export interface HolderRegistryView {
  assetId: string;
  assetName: string;
  tokenAddress: string;
  holders: RegistryHolderView[];
  registryTotal: string;
  onChainSupply: string;
  matchesChain: boolean;
  history: RegistryEventView[];
}

export class GetHolderRegistry {
  constructor(
    private readonly assets: AssetRepository,
    private readonly chain: TokenEventSource,
    private readonly wallets: WalletDirectory,
  ) {}

  async execute(input: { assetId: string }): Promise<HolderRegistryView> {
    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
      throw new AssetNotTokenizedForRegistryError(asset.id);
    }

    const events = await this.chain.registryEvents(asset.tokenAddress);
    const registry = HolderRegistry.fromEvents(events);
    const reconciliation = registry.reconcile(await this.chain.totalSupply(asset.tokenAddress));
    const directory = await this.wallets.byWallet();
    const label = (wallet: string) =>
      directory.get(wallet.toLowerCase())?.email ?? wallet.toLowerCase();

    const holders = registry.holders.map((position) => {
      const identity = directory.get(position.holder.toLowerCase());
      return {
        wallet: position.holder.toLowerCase(),
        tokens: String(position.tokens),
        since: position.since.toISOString(),
        shareBps:
          reconciliation.registryTotal === 0n
            ? 0
            : Number((position.tokens * 10000n) / reconciliation.registryTotal),
        ...(identity ? { investorId: identity.investorId, email: identity.email } : {}),
      };
    });

    const history = registry.history.map((event) => ({
      kind: event.kind,
      tokens: String(event.tokens),
      at: event.at.toISOString(),
      ref: event.ref,
      ...("from" in event ? { from: label(event.from) } : {}),
      ...("to" in event ? { to: label(event.to) } : {}),
    }));

    return {
      assetId: asset.id,
      assetName: asset.name,
      tokenAddress: asset.tokenAddress,
      holders,
      registryTotal: String(reconciliation.registryTotal),
      onChainSupply: String(reconciliation.onChainSupply),
      matchesChain: reconciliation.matches,
      history,
    };
  }
}
