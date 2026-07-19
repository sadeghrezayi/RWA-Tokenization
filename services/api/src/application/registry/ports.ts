import type { RegistryEvent } from "../../domain/registry/holder-registry.js";

// FR-RA-1: reads the token's complete, classified event stream from the chain
// in chain order (block number, then log index), plus the live total supply.
// The chain — not our bookkeeping — is the source the registry is rebuilt from.
export interface TokenEventSource {
  registryEvents(tokenAddress: string): Promise<RegistryEvent[]>;
  totalSupply(tokenAddress: string): Promise<bigint>;
}

// P2: maps custodial wallet addresses back to platform investors so the
// registry names people, not hex. Keys MUST be lowercase addresses.
export interface WalletIdentity {
  investorId: string;
  email: string;
}

export interface WalletDirectory {
  byWallet(): Promise<Map<string, WalletIdentity>>;
}
