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
  // K-2 recovery: approved investors with no ONCHAINID identity at all. The
  // identity is the FIRST chain call an approval makes, so an outage leaves
  // exactly this trace. A definite subset of who needs a reissued claim —
  // someone whose identity deployed and whose claim then failed is not counted,
  // because nothing on this side can tell them from a healthy investor.
  approvedWithoutOnchainIdentity(): Promise<number>;
  // P0-2 step 3 residue (K-34): allocations whose tokens were never issued.
  // Since capture follows a confirmed mint, their cost is still HELD on the
  // investor's ledger — money in escrow for tokens that do not exist. bigint
  // because a Rial escrow total outgrows a float.
  allocationsAwaitingMint(): Promise<{ count: number; heldRial: bigint }>;
}

// 4.4 / FR-RA-4: how much reached holders' ledgers, grouped by what caused it.
//
// Keyed by reference (a distribution id). Entries written before the reference
// column existed are absent rather than zero — an auditor has to be able to
// tell "not traceable" from "traced and found to be nothing".
export interface LedgerCreditReader {
  creditedPerReference(): Promise<Map<string, bigint>>;
}
