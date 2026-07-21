// FR-RA-2 read side of the append-only event log: every privileged action
// lands in asset_events (actor, timestamp, details); this port queries it.
// Adapters return events newest first and enforce the limit.
export interface RecordedAssetEvent {
  id: string;
  assetId: string;
  event: string;
  actor: string;
  details: Record<string, string>;
  at: Date;
}

export interface AssetEventReader {
  list(filter: { assetId?: string; actor?: string; limit?: number }): Promise<RecordedAssetEvent[]>;
}

// Reachability checks for the system-health view (NFR-8 operability,
// "system health" in FR-PT-3). Each returns a simple liveness signal; the
// adapter owns the actual pings so the use-case stays I/O-free.
export interface HealthProbe {
  postgres(): Promise<boolean>;
  ipfs(): Promise<boolean>;
  chain(): Promise<{ reachable: boolean; blockNumber?: number }>;
  pausedTokenCount(): Promise<number>;
}
