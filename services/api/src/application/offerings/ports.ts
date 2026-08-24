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

// P0-2 step 1: which allocations have actually been minted.
//
// `mint` issues tokens unconditionally, and nothing recorded that it had run —
// so replaying a close, or redelivering the message once the mint moves onto
// the outbox, issues the tokens twice. That is not a glitch: it inflates the
// asset's supply against the registry an auditor reconciles it with (FR-RA-4).
//
// Three states, because two are not enough to be honest:
//   unminted   — no attempt recorded; mint it.
//   unresolved — an attempt was claimed but never confirmed. Nobody knows
//                whether the chain took it. Re-minting may double-issue and
//                skipping leaves a holder who paid with nothing, so neither is
//                safe to do automatically.
//   minted     — confirmed; skip it, which is the idempotent no-op.
export type AllocationMintState = "unminted" | "unresolved" | "minted";

export interface AllocationKey {
  offeringId: string;
  investorId: string;
}

export interface AllocationMintLog {
  stateOf(key: AllocationKey): Promise<AllocationMintState>;
  // Records the INTENT to mint, before the chain is touched. Returns false if
  // some other caller already claimed it — the guard against a concurrent
  // redelivery, not merely a sequential one.
  claim(key: AllocationKey, tokens: bigint): Promise<boolean>;
  confirm(key: AllocationKey): Promise<void>;
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
