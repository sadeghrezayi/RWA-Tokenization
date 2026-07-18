import { Redemption } from "../../domain/redemptions/redemption.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { IdGenerator, InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import {
  AssetNotTokenizedForTransferError,
  InsufficientTokenBalanceError,
  TransferNotAllowedError,
} from "../transfers/errors.js";
import type { AssetTokenTransferrer } from "../transfers/ports.js";
import type { RedemptionRepository } from "./ports.js";

// FR-TR-2: a holder asks to redeem tokens against the underlying right. No
// chain action or payout happens here — the operator fulfills separately after
// review (pricing needs a fresh valuation at fulfillment time).
export class RequestRedemption {
  constructor(
    private readonly redemptions: RedemptionRepository,
    private readonly investors: InvestorRepository,
    private readonly assets: AssetRepository,
    private readonly transferrer: AssetTokenTransferrer,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    assetId: string;
    investorId: string;
    tokens: bigint;
  }): Promise<{ redemptionId: string }> {
    const investor = await loadInvestor(this.investors, input.investorId);
    if (!investor.isEligibleForClaims()) {
      throw new TransferNotAllowedError();
    }

    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
      throw new AssetNotTokenizedForTransferError(asset.id);
    }

    const redemption = Redemption.request({
      id: this.ids.nextId(),
      assetId: asset.id,
      tokenAddress: asset.tokenAddress,
      investorId: input.investorId,
      tokens: input.tokens,
      requestedAt: this.clock.now(),
    });

    const balance = await this.transferrer.balanceOf(asset.tokenAddress, input.investorId);
    if (balance < input.tokens) {
      throw new InsufficientTokenBalanceError();
    }

    await this.redemptions.save(redemption);
    await this.events.append({
      assetId: asset.id,
      event: "redemption_requested",
      actor: input.investorId,
      details: { redemptionId: redemption.id, tokens: String(input.tokens) },
    });
    return { redemptionId: redemption.id };
  }
}
