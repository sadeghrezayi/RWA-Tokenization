import {
  InvalidOfferingConfigError,
  InvalidOfferingTransitionError,
  SubscriptionLimitError,
  SubscriptionWindowClosedError,
} from "./errors.js";

// FR-PI: primary issuance. Amounts are bigint — token quantities are whole
// units (asset tokens have 0 decimals) and prices are integer Rials (D3).
export type OfferingState = "draft" | "open" | "closed_success" | "closed_failed";

export interface Subscription {
  investorId: string;
  tokens: bigint;
}

export interface Allocation {
  investorId: string;
  requested: bigint;
  allocated: bigint;
  costRial: bigint;
  refundRial: bigint;
}

export interface OfferingFields {
  id: string;
  assetId: string;
  tokenAddress: string;
  supply: bigint;
  priceRial: bigint;
  minPerInvestor: bigint;
  maxPerInvestor: bigint;
  minimumRaise: bigint;
  opensAt: Date;
  closesAt: Date;
}

export class Offering {
  private constructor(
    public readonly id: string,
    public readonly assetId: string,
    public readonly tokenAddress: string,
    public readonly supply: bigint,
    public readonly priceRial: bigint,
    public readonly minPerInvestor: bigint,
    public readonly maxPerInvestor: bigint,
    public readonly minimumRaise: bigint,
    public readonly opensAt: Date,
    public readonly closesAt: Date,
    public readonly state: OfferingState,
    public readonly subscriptions: readonly Subscription[],
    public readonly allocations: readonly Allocation[] | undefined,
  ) {}

  static create(fields: OfferingFields): Offering {
    if (fields.supply <= 0n) {
      throw new InvalidOfferingConfigError("supply must be positive");
    }
    if (fields.priceRial <= 0n) {
      throw new InvalidOfferingConfigError("price must be positive");
    }
    if (fields.minPerInvestor <= 0n) {
      throw new InvalidOfferingConfigError("per-investor minimum must be positive");
    }
    if (fields.maxPerInvestor < fields.minPerInvestor) {
      throw new InvalidOfferingConfigError("per-investor maximum must be at least the minimum");
    }
    if (fields.maxPerInvestor > fields.supply) {
      throw new InvalidOfferingConfigError("per-investor maximum cannot exceed the supply");
    }
    if (fields.minimumRaise > fields.supply) {
      throw new InvalidOfferingConfigError("minimum raise cannot exceed the supply");
    }
    if (fields.opensAt.getTime() >= fields.closesAt.getTime()) {
      throw new InvalidOfferingConfigError("the window must open before it closes");
    }
    return new Offering(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.supply,
      fields.priceRial,
      fields.minPerInvestor,
      fields.maxPerInvestor,
      fields.minimumRaise,
      fields.opensAt,
      fields.closesAt,
      "draft",
      [],
      undefined,
    );
  }

  static restore(
    fields: OfferingFields & {
      state: OfferingState;
      subscriptions: readonly Subscription[];
      allocations: readonly Allocation[] | undefined;
    },
  ): Offering {
    return new Offering(
      fields.id,
      fields.assetId,
      fields.tokenAddress,
      fields.supply,
      fields.priceRial,
      fields.minPerInvestor,
      fields.maxPerInvestor,
      fields.minimumRaise,
      fields.opensAt,
      fields.closesAt,
      fields.state,
      [...fields.subscriptions],
      fields.allocations ? [...fields.allocations] : undefined,
    );
  }

  open(now: Date): Offering {
    this.assertState("open", "draft");
    if (now.getTime() >= this.closesAt.getTime()) {
      throw new InvalidOfferingTransitionError(
        "cannot open an offering whose window has already ended",
      );
    }
    return this.with({ state: "open" });
  }

  subscribe(investorId: string, tokens: bigint, now: Date): Offering {
    this.assertState("subscribe to", "open");
    const at = now.getTime();
    if (at < this.opensAt.getTime() || at > this.closesAt.getTime()) {
      throw new SubscriptionWindowClosedError("the subscription window is not open");
    }
    if (tokens < this.minPerInvestor) {
      throw new SubscriptionLimitError(
        `a subscription must be at least ${String(this.minPerInvestor)} tokens`,
      );
    }
    const already = this.requestedBy(investorId);
    if (already + tokens > this.maxPerInvestor) {
      throw new SubscriptionLimitError(
        `an investor may subscribe for at most ${String(this.maxPerInvestor)} tokens in total`,
      );
    }
    return this.with({ subscriptions: [...this.subscriptions, { investorId, tokens }] });
  }

  // FR-PI-3 + D5: below the minimum raise everything refunds; otherwise
  // allocate fully, or pro-rata (floor + deterministic remainder in first-
  // subscription order) when demand exceeds supply.
  close(now: Date): Offering {
    this.assertState("close", "open");
    if (now.getTime() < this.closesAt.getTime()) {
      throw new InvalidOfferingTransitionError(
        "cannot close an offering before its window has ended",
      );
    }

    const demands = this.demandsInFirstSubscriptionOrder();
    const totalRequested = demands.reduce((sum, d) => sum + d.requested, 0n);

    if (totalRequested < this.minimumRaise) {
      const allocations = demands.map((d) => ({
        investorId: d.investorId,
        requested: d.requested,
        allocated: 0n,
        costRial: 0n,
        refundRial: d.requested * this.priceRial,
      }));
      return this.with({ state: "closed_failed", allocations });
    }

    const allocated = new Map<string, bigint>();
    if (totalRequested <= this.supply) {
      for (const d of demands) {
        allocated.set(d.investorId, d.requested);
      }
    } else {
      let assigned = 0n;
      for (const d of demands) {
        const share = (d.requested * this.supply) / totalRequested;
        allocated.set(d.investorId, share);
        assigned += share;
      }
      // Floor rounding leaves fewer leftover tokens than investors; one pass
      // in first-subscription order distributes them deterministically.
      let leftover = this.supply - assigned;
      for (const d of demands) {
        if (leftover === 0n) break;
        const current = allocated.get(d.investorId) ?? 0n;
        if (current < d.requested) {
          allocated.set(d.investorId, current + 1n);
          leftover -= 1n;
        }
      }
    }

    const allocations = demands.map((d) => {
      const tokens = allocated.get(d.investorId) ?? 0n;
      return {
        investorId: d.investorId,
        requested: d.requested,
        allocated: tokens,
        costRial: tokens * this.priceRial,
        refundRial: (d.requested - tokens) * this.priceRial,
      };
    });
    return this.with({ state: "closed_success", allocations });
  }

  private requestedBy(investorId: string): bigint {
    return this.subscriptions
      .filter((s) => s.investorId === investorId)
      .reduce((sum, s) => sum + s.tokens, 0n);
  }

  private demandsInFirstSubscriptionOrder(): { investorId: string; requested: bigint }[] {
    const order: string[] = [];
    const totals = new Map<string, bigint>();
    for (const s of this.subscriptions) {
      if (!totals.has(s.investorId)) {
        order.push(s.investorId);
      }
      totals.set(s.investorId, (totals.get(s.investorId) ?? 0n) + s.tokens);
    }
    return order.map((investorId) => ({
      investorId,
      requested: totals.get(investorId) ?? 0n,
    }));
  }

  private assertState(action: string, required: OfferingState): void {
    if (this.state !== required) {
      throw new InvalidOfferingTransitionError(
        `cannot ${action} an offering in state "${this.state}"`,
      );
    }
  }

  private with(changes: {
    state?: OfferingState;
    subscriptions?: readonly Subscription[];
    allocations?: readonly Allocation[];
  }): Offering {
    return new Offering(
      this.id,
      this.assetId,
      this.tokenAddress,
      this.supply,
      this.priceRial,
      this.minPerInvestor,
      this.maxPerInvestor,
      this.minimumRaise,
      this.opensAt,
      this.closesAt,
      changes.state ?? this.state,
      changes.subscriptions ?? this.subscriptions,
      changes.allocations ?? this.allocations,
    );
  }
}
