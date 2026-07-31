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

// 2.2: asks the public web app to drop its cached marketplace pages.
//
// Publishing and (especially) WITHDRAWING an offering must take effect for
// anonymous visitors at once — a cached page that keeps advertising a withdrawn
// offering is still soliciting. Best-effort by design: the web app's ISR window
// is the fallback if this call fails, so a purge failure must never block or
// undo the publication decision itself.
export interface PublicPageRevalidator {
  offeringChanged(offeringId: string): Promise<void>;
}
