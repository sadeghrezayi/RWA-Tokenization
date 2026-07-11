import type { Offering } from "../../domain/offerings/offering.js";

export interface OfferingRepository {
  findById(id: string): Promise<Offering | undefined>;
  findAll(): Promise<Offering[]>;
  save(offering: Offering): Promise<void>;
}

// D3: the off-chain Rial ledger backed by the segregated bank account.
// Amounts are integer Rials. hold = balance → escrow (FR-PI-2), release =
// escrow → balance (refund), capture = escrow → platform (settled cost).
export interface SettlementRail {
  hold(investorId: string, amountRial: bigint): Promise<void>;
  release(investorId: string, amountRial: bigint): Promise<void>;
  capture(investorId: string, amountRial: bigint): Promise<void>;
}

// FR-PI-3: mints allocations of the (per-asset) token and finally enables
// transfers. The adapter owns custodial wallets and registry verification.
export interface AssetTokenIssuer {
  mint(tokenAddress: string, investorId: string, tokens: bigint): Promise<void>;
  finalize(tokenAddress: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}
