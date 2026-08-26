import type { Offering } from "../../src/domain/offerings/offering.js";
import type {
  AllocationKey,
  AllocationMintLog,
  AllocationMintState,
  AssetTokenIssuer,
  Clock,
  OfferingRepository,
  SettlementRail,
} from "../../src/application/offerings/ports.js";
import { InsufficientFundsError } from "../../src/application/offerings/errors.js";

export class InMemoryOfferingRepository implements OfferingRepository {
  private readonly byId = new Map<string, Offering>();
  failNextSave: Error | undefined;

  findById(id: string): Promise<Offering | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findAll(): Promise<Offering[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  save(offering: Offering): Promise<void> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      return Promise.reject(error);
    }
    this.byId.set(offering.id, offering);
    return Promise.resolve();
  }
}

// In-memory twin of the Rial ledger: balance ↔ escrow ↔ captured.
export class FakeSettlementRail implements SettlementRail {
  readonly balances = new Map<string, bigint>();
  readonly held = new Map<string, bigint>();
  readonly captured = new Map<string, bigint>();
  // Every capture that actually moved money, in order — what lets a test assert
  // WHEN the money moved and not merely that it did.
  readonly captureLog: { investorId: string; amountRial: bigint; reference: string }[] = [];
  onCapture?: () => void;

  credit(investorId: string, amountRial: bigint): void {
    this.balances.set(investorId, (this.balances.get(investorId) ?? 0n) + amountRial);
  }

  hold(investorId: string, amountRial: bigint): Promise<void> {
    const balance = this.balances.get(investorId) ?? 0n;
    if (balance < amountRial) {
      return Promise.reject(new InsufficientFundsError());
    }
    this.balances.set(investorId, balance - amountRial);
    this.held.set(investorId, (this.held.get(investorId) ?? 0n) + amountRial);
    return Promise.resolve();
  }

  release(investorId: string, amountRial: bigint): Promise<void> {
    const held = this.held.get(investorId) ?? 0n;
    if (held < amountRial) {
      return Promise.reject(new Error(`release exceeds held funds for ${investorId}`));
    }
    this.held.set(investorId, held - amountRial);
    this.balances.set(investorId, (this.balances.get(investorId) ?? 0n) + amountRial);
    return Promise.resolve();
  }

  capture(investorId: string, amountRial: bigint, reference: string): Promise<void> {
    // Mirrors the real rail's partial unique index: the same reference for the
    // same investor is a no-op, not a second debit.
    if (this.captureLog.some((c) => c.investorId === investorId && c.reference === reference)) {
      return Promise.resolve();
    }
    const held = this.held.get(investorId) ?? 0n;
    if (held < amountRial) {
      return Promise.reject(new Error(`capture exceeds held funds for ${investorId}`));
    }
    this.onCapture?.();
    this.held.set(investorId, held - amountRial);
    this.captured.set(investorId, (this.captured.get(investorId) ?? 0n) + amountRial);
    this.captureLog.push({ investorId, amountRial, reference });
    return Promise.resolve();
  }
}

export class RecordingAssetTokenIssuer implements AssetTokenIssuer {
  readonly minted: { tokenAddress: string; investorId: string; tokens: bigint }[] = [];
  readonly finalized: string[] = [];
  // Set to make the next mint reject, so a chain refusal can be exercised.
  failNextMint?: Error | undefined;
  // Set to make EVERY mint reject — a chain that is down rather than one that
  // hiccupped. `failNextMint` cannot express that: with two drainers racing,
  // whichever loses the race would find it already cleared and succeed, which
  // is the opposite of the scenario under test.
  failEveryMint?: Error | undefined;

  mint(tokenAddress: string, investorId: string, tokens: bigint): Promise<void> {
    if (this.failEveryMint !== undefined) {
      return Promise.reject(this.failEveryMint);
    }
    const failure = this.failNextMint;
    if (failure !== undefined) {
      this.failNextMint = undefined;
      return Promise.reject(failure);
    }
    this.minted.push({ tokenAddress, investorId, tokens });
    return Promise.resolve();
  }

  finalize(tokenAddress: string): Promise<void> {
    this.finalized.push(tokenAddress);
    return Promise.resolve();
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}

// P0-2 step 1. The reference implementation the Prisma adapter is held to.
export class InMemoryAllocationMintLog implements AllocationMintLog {
  private readonly rows = new Map<string, { tokens: bigint; confirmed: boolean }>();

  private id(key: AllocationKey): string {
    return `${key.offeringId}:${key.investorId}`;
  }

  // Test seam: fires once, between this caller's read and its write, so the
  // "another delivery claimed it first" race can be exercised deterministically
  // instead of hoped for.
  onNextStateRead?: (() => void) | undefined;

  stateOf(key: AllocationKey): Promise<AllocationMintState> {
    const row = this.rows.get(this.id(key));
    const state: AllocationMintState =
      row === undefined ? "unminted" : row.confirmed ? "minted" : "unresolved";
    // Fires AFTER the read, so the other caller's claim lands in the window
    // between this caller reading "unminted" and writing its own claim — which
    // is the race, and firing before the read would only model losing earlier.
    const hook = this.onNextStateRead;
    if (hook !== undefined) {
      this.onNextStateRead = undefined;
      hook();
    }
    return Promise.resolve(state);
  }

  claim(key: AllocationKey, tokens: bigint): Promise<boolean> {
    const id = this.id(key);
    if (this.rows.has(id)) return Promise.resolve(false);
    this.rows.set(id, { tokens, confirmed: false });
    return Promise.resolve(true);
  }

  release(key: AllocationKey): Promise<void> {
    const row = this.rows.get(this.id(key));
    // Never release a confirmed mint — that would let a retry double-issue.
    if (row !== undefined && !row.confirmed) this.rows.delete(this.id(key));
    return Promise.resolve();
  }

  confirm(key: AllocationKey): Promise<void> {
    const row = this.rows.get(this.id(key));
    if (row !== undefined) row.confirmed = true;
    return Promise.resolve();
  }
}
