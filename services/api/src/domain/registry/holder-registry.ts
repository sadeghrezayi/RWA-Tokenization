import { CorruptEventStreamError, InvalidRegistryEventError } from "./errors.js";

// FR-RA-1: the transfer-agent-grade holder registry, reconstructed purely from
// the token's chain event stream (mint / transfer / burn) — never from our own
// bookkeeping. Holder keys are opaque (wallet addresses at the edge); `ref` is
// the chain reference (tx hash) so every row traces to evidence (P5). The
// stream must be in chain order (block, then log index) — the adapter's job.
export type RegistryEvent =
  | { kind: "mint"; to: string; tokens: bigint; at: Date; ref: string }
  | { kind: "transfer"; from: string; to: string; tokens: bigint; at: Date; ref: string }
  | { kind: "burn"; from: string; tokens: bigint; at: Date; ref: string };

export interface HolderPosition {
  holder: string;
  tokens: bigint;
  since: Date;
}

export interface Reconciliation {
  matches: boolean;
  registryTotal: bigint;
  onChainSupply: bigint;
}

export class HolderRegistry {
  private constructor(
    private readonly positions: HolderPosition[],
    private readonly events: RegistryEvent[],
  ) {}

  static fromEvents(events: RegistryEvent[]): HolderRegistry {
    const balances = new Map<string, { tokens: bigint; since: Date }>();

    const credit = (holder: string, tokens: bigint, at: Date) => {
      const current = balances.get(holder);
      if (current === undefined || current.tokens === 0n) {
        balances.set(holder, { tokens, since: at });
      } else {
        balances.set(holder, { tokens: current.tokens + tokens, since: current.since });
      }
    };
    const debit = (holder: string, tokens: bigint, ref: string) => {
      const current = balances.get(holder);
      if (current === undefined || current.tokens < tokens) {
        throw new CorruptEventStreamError(
          `event ${ref} takes holder ${holder} below zero — the stream is incomplete or out of order`,
        );
      }
      balances.set(holder, { tokens: current.tokens - tokens, since: current.since });
    };

    for (const event of events) {
      if (event.tokens <= 0n) {
        throw new InvalidRegistryEventError(
          `event ${event.ref} has a non-positive amount ${String(event.tokens)}`,
        );
      }
      switch (event.kind) {
        case "mint":
          credit(event.to, event.tokens, event.at);
          break;
        case "burn":
          debit(event.from, event.tokens, event.ref);
          break;
        case "transfer":
          debit(event.from, event.tokens, event.ref);
          credit(event.to, event.tokens, event.at);
          break;
      }
    }

    const positions = [...balances.entries()]
      .filter(([, position]) => position.tokens > 0n)
      .map(([holder, position]) => ({ holder, tokens: position.tokens, since: position.since }))
      .sort((a, b) =>
        a.tokens === b.tokens ? a.holder.localeCompare(b.holder) : a.tokens > b.tokens ? -1 : 1,
      );
    return new HolderRegistry(positions, [...events]);
  }

  get holders(): HolderPosition[] {
    return this.positions.map((position) => ({ ...position }));
  }

  get history(): RegistryEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  get totalTokens(): bigint {
    return this.positions.reduce((sum, position) => sum + position.tokens, 0n);
  }

  reconcile(onChainSupply: bigint): Reconciliation {
    const registryTotal = this.totalTokens;
    return { matches: registryTotal === onChainSupply, registryTotal, onChainSupply };
  }
}
