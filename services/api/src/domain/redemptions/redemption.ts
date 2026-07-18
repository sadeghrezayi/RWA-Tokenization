import { InvalidRedemptionError, InvalidRedemptionTransitionError } from "./errors.js";

// FR-TR-2: redemption — a holder burns tokens against the underlying right and
// is paid out at the attested value (P5: the payout traces to a signed
// valuation). States: requested → fulfilled | rejected. Amounts are bigint.
export type RedemptionState = "requested" | "fulfilled" | "rejected";

export interface RequestRedemptionFields {
  id: string;
  assetId: string;
  tokenAddress: string;
  investorId: string;
  tokens: bigint;
  requestedAt: Date;
}

// Pro-rata share of the latest attested valuation: floor(value * tokens / supply).
export const redemptionPayout = (
  valuationRial: bigint,
  circulatingSupply: bigint,
  tokens: bigint,
): bigint => {
  if (circulatingSupply <= 0n) {
    throw new InvalidRedemptionError("cannot value a redemption without circulating supply");
  }
  if (tokens > circulatingSupply) {
    throw new InvalidRedemptionError("cannot redeem more tokens than are in circulation");
  }
  return (valuationRial * tokens) / circulatingSupply;
};

export class Redemption {
  private constructor(
    public readonly id: string,
    public readonly assetId: string,
    public readonly tokenAddress: string,
    public readonly investorId: string,
    public readonly tokens: bigint,
    public readonly state: RedemptionState,
    public readonly requestedAt: Date,
    public readonly payoutRial: bigint | undefined,
    public readonly rejectionReason: string | undefined,
    public readonly resolvedAt: Date | undefined,
  ) {}

  static request(fields: RequestRedemptionFields): Redemption {
    if (fields.tokens <= 0n) {
      throw new InvalidRedemptionError("a redemption amount must be positive");
    }
    return new Redemption(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.investorId,
      fields.tokens,
      "requested",
      fields.requestedAt,
      undefined,
      undefined,
      undefined,
    );
  }

  static restore(fields: {
    id: string;
    assetId: string;
    tokenAddress: string;
    investorId: string;
    tokens: bigint;
    state: RedemptionState;
    requestedAt: Date;
    payoutRial?: bigint;
    rejectionReason?: string;
    resolvedAt?: Date;
  }): Redemption {
    return new Redemption(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.investorId,
      fields.tokens,
      fields.state,
      fields.requestedAt,
      fields.payoutRial,
      fields.rejectionReason,
      fields.resolvedAt,
    );
  }

  fulfill(payoutRial: bigint, at: Date): Redemption {
    this.assertRequested("fulfill");
    if (payoutRial <= 0n) {
      throw new InvalidRedemptionError("a redemption payout must be positive");
    }
    return new Redemption(
      this.id,
      this.assetId,
      this.tokenAddress,
      this.investorId,
      this.tokens,
      "fulfilled",
      this.requestedAt,
      payoutRial,
      undefined,
      at,
    );
  }

  reject(reason: string, at: Date): Redemption {
    this.assertRequested("reject");
    const trimmed = reason.trim();
    if (trimmed === "") {
      throw new InvalidRedemptionError("a rejection must state a non-empty reason");
    }
    return new Redemption(
      this.id,
      this.assetId,
      this.tokenAddress,
      this.investorId,
      this.tokens,
      "rejected",
      this.requestedAt,
      undefined,
      trimmed,
      at,
    );
  }

  private assertRequested(action: string): void {
    if (this.state !== "requested") {
      throw new InvalidRedemptionTransitionError(
        `cannot ${action} a redemption in state "${this.state}"`,
      );
    }
  }
}
