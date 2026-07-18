import type { Redemption, RedemptionState } from "../../domain/redemptions/redemption.js";
import type { RedemptionRepository } from "./ports.js";

export interface RedemptionView {
  id: string;
  assetId: string;
  tokenAddress: string;
  investorId: string;
  tokens: string;
  state: RedemptionState;
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
  resolvedAt?: string;
}

export const toRedemptionView = (r: Redemption): RedemptionView => ({
  id: r.id,
  assetId: r.assetId,
  tokenAddress: r.tokenAddress,
  investorId: r.investorId,
  tokens: String(r.tokens),
  state: r.state,
  requestedAt: r.requestedAt.toISOString(),
  ...(r.payoutRial !== undefined ? { payoutRial: String(r.payoutRial) } : {}),
  ...(r.rejectionReason !== undefined ? { rejectionReason: r.rejectionReason } : {}),
  ...(r.resolvedAt !== undefined ? { resolvedAt: r.resolvedAt.toISOString() } : {}),
});

export class ListRedemptions {
  constructor(private readonly redemptions: RedemptionRepository) {}

  async executeAll(): Promise<RedemptionView[]> {
    return (await this.redemptions.findAll()).map(toRedemptionView);
  }

  async executeForInvestor(input: { investorId: string }): Promise<RedemptionView[]> {
    return (await this.redemptions.findByInvestor(input.investorId)).map(toRedemptionView);
  }
}
