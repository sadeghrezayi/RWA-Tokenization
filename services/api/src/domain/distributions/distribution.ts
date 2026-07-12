import { InvalidDistributionError, InvalidDistributionTransitionError } from "./errors.js";

// FR-YD: yield/income distribution. Amounts are integer Rial (D3), token
// holdings are whole units — both bigint.
export type DistributionState = "declared" | "paid";

export interface HolderShare {
  investorId: string;
  tokens: bigint;
}

export interface Payout {
  investorId: string;
  tokens: bigint;
  amountRial: bigint;
}

export interface DeclareFields {
  id: string;
  assetId: string;
  tokenAddress: string;
  totalAmountRial: bigint;
  snapshot: readonly HolderShare[];
}

export class Distribution {
  private constructor(
    public readonly id: string,
    public readonly assetId: string,
    public readonly tokenAddress: string,
    public readonly totalAmountRial: bigint,
    public readonly state: DistributionState,
    public readonly payouts: readonly Payout[],
  ) {}

  // FR-YD-1: pro-rata by holdings. Floor each share, then hand the leftover
  // Rial units one at a time to the largest holders (id ascending on ties) —
  // deterministic, and conserves the declared total exactly.
  static declare(fields: DeclareFields): Distribution {
    if (fields.totalAmountRial <= 0n) {
      throw new InvalidDistributionError("a distribution amount must be positive");
    }
    if (fields.snapshot.length === 0) {
      throw new InvalidDistributionError("a distribution needs at least one holder");
    }
    for (const holder of fields.snapshot) {
      if (holder.tokens <= 0n) {
        throw new InvalidDistributionError("every holder in the snapshot must hold tokens");
      }
    }

    const ordered = [...fields.snapshot].sort(
      (x, y) => compareDesc(x.tokens, y.tokens) || compareAsc(x.investorId, y.investorId),
    );
    const totalTokens = ordered.reduce((sum, h) => sum + h.tokens, 0n);

    const payouts: Payout[] = ordered.map((h) => ({
      investorId: h.investorId,
      tokens: h.tokens,
      amountRial: (fields.totalAmountRial * h.tokens) / totalTokens,
    }));
    let remainder = fields.totalAmountRial - payouts.reduce((sum, p) => sum + p.amountRial, 0n);
    for (const payout of payouts) {
      if (remainder === 0n) break;
      payout.amountRial += 1n;
      remainder -= 1n;
    }

    return new Distribution(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.totalAmountRial,
      "declared",
      payouts,
    );
  }

  static restore(fields: {
    id: string;
    assetId: string;
    tokenAddress: string;
    totalAmountRial: bigint;
    state: DistributionState;
    payouts: readonly Payout[];
  }): Distribution {
    return new Distribution(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.totalAmountRial,
      fields.state,
      [...fields.payouts],
    );
  }

  markPaid(): Distribution {
    if (this.state !== "declared") {
      throw new InvalidDistributionTransitionError(
        `cannot pay a distribution in state "${this.state}"`,
      );
    }
    return new Distribution(
      this.id,
      this.assetId,
      this.tokenAddress,
      this.totalAmountRial,
      "paid",
      this.payouts,
    );
  }
}

const compareDesc = (a: bigint, b: bigint): number => (a < b ? 1 : a > b ? -1 : 0);
const compareAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
