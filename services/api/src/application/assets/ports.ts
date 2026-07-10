import type { Asset } from "../../domain/assets/asset.js";

export interface AssetRepository {
  findById(id: string): Promise<Asset | undefined>;
  findAll(): Promise<Asset[]>;
  save(asset: Asset): Promise<void>;
}

// FR-AO-2: immutable document storage (self-hosted IPFS in production).
// The adapter stores the bytes and returns the content id + sha256 digest.
export interface DocumentStore {
  store(content: Uint8Array): Promise<{ cid: string; sha256: string }>;
}

// FR-AO-5: audit-logged transitions — the seed of the FR-RA-2 audit log.
export interface AssetEvent {
  assetId: string;
  event: string;
  actor: string;
  details?: Record<string, string>;
}

export interface AssetEventLog {
  append(event: AssetEvent): Promise<void>;
}
