import type { Distribution, HolderShare } from "../../domain/distributions/distribution.js";

export interface DistributionRepository {
  findById(id: string): Promise<Distribution | undefined>;
  findAll(): Promise<Distribution[]>;
  save(distribution: Distribution): Promise<void>;
}

// FR-YD-1 record-date snapshot: reads current on-chain holdings of a token,
// mapped back to platform investor ids. Only holders with a positive balance.
export interface HolderSnapshotProvider {
  snapshot(tokenAddress: string): Promise<HolderShare[]>;
}

// D5b "credit & hold": a payout credits the investor's Rial balance directly
// (an internal ledger write that cannot fail like a bank withdrawal would).
export interface DistributionLedger {
  payout(investorId: string, amountRial: bigint): Promise<void>;
}

// 1.7c-ii: raised once a distribution is paid, so each holder is told what they
// received. Implemented by the notifications module; this module owns the port.
export interface DistributionPaidNotice {
  distributionId: string;
  assetName: string;
  payouts: readonly { investorId: string; amountRial: bigint }[];
}

export interface DistributionPaidNotifier {
  distributionPaid(notice: DistributionPaidNotice): Promise<void>;
}
