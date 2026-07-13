// Reachability checks for the system-health view (NFR-8 operability,
// "system health" in FR-PT-3). Each returns a simple liveness signal; the
// adapter owns the actual pings so the use-case stays I/O-free.
export interface HealthProbe {
  postgres(): Promise<boolean>;
  ipfs(): Promise<boolean>;
  chain(): Promise<{ reachable: boolean; blockNumber?: number }>;
  pausedTokenCount(): Promise<number>;
}
