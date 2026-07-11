import { createHash } from "node:crypto";
import type { Asset } from "../../src/domain/assets/asset.js";
import type {
  AssetEvent,
  AssetEventLog,
  AssetRepository,
  AssetTokenDeployer,
  DocumentStore,
} from "../../src/application/assets/ports.js";

export class InMemoryAssetRepository implements AssetRepository {
  private readonly byId = new Map<string, Asset>();

  findById(id: string): Promise<Asset | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findAll(): Promise<Asset[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  save(asset: Asset): Promise<void> {
    this.byId.set(asset.id, asset);
    return Promise.resolve();
  }
}

// Deterministic stand-in for IPFS: real sha256, fake sequential CID.
export class FakeDocumentStore implements DocumentStore {
  private counter = 0;
  readonly stored: Uint8Array[] = [];

  store(content: Uint8Array): Promise<{ cid: string; sha256: string }> {
    this.counter += 1;
    this.stored.push(content);
    return Promise.resolve({
      cid: `fake-cid-${String(this.counter)}`,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
}

export class RecordingTokenDeployer implements AssetTokenDeployer {
  readonly deployed: { assetId: string; name: string; symbol: string }[] = [];
  failWith: Error | undefined;

  deployAssetToken(params: {
    assetId: string;
    name: string;
    symbol: string;
  }): Promise<{ tokenAddress: string }> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.deployed.push(params);
    return Promise.resolve({ tokenAddress: `0xDeployed${String(this.deployed.length)}` });
  }
}

export class RecordingAssetEventLog implements AssetEventLog {
  readonly events: AssetEvent[] = [];

  append(event: AssetEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}
