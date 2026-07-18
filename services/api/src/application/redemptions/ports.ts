import type { Redemption } from "../../domain/redemptions/redemption.js";

export interface RedemptionRepository {
  findById(id: string): Promise<Redemption | undefined>;
  findAll(): Promise<Redemption[]>;
  findByInvestor(investorId: string): Promise<Redemption[]>;
  save(redemption: Redemption): Promise<void>;
}

// FR-TR-2: burns redeemed tokens on the asset's ERC-3643 token (operator as
// agent). The burn is the point of no return — payout follows only after it.
export interface AssetTokenBurner {
  burn(tokenAddress: string, investorId: string, tokens: bigint): Promise<void>;
}

// D5b credit-and-hold: the payout credits the investor's Rial ledger balance
// (adapter writes a distinct "redemption" ledger-entry kind for the audit trail).
export interface RedemptionLedger {
  credit(investorId: string, amountRial: bigint): Promise<void>;
}
