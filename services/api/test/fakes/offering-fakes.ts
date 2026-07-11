import type { Offering } from "../../src/domain/offerings/offering.js";
import type {
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

  capture(investorId: string, amountRial: bigint): Promise<void> {
    const held = this.held.get(investorId) ?? 0n;
    if (held < amountRial) {
      return Promise.reject(new Error(`capture exceeds held funds for ${investorId}`));
    }
    this.held.set(investorId, held - amountRial);
    this.captured.set(investorId, (this.captured.get(investorId) ?? 0n) + amountRial);
    return Promise.resolve();
  }
}

export class RecordingAssetTokenIssuer implements AssetTokenIssuer {
  readonly minted: { tokenAddress: string; investorId: string; tokens: bigint }[] = [];
  readonly finalized: string[] = [];

  mint(tokenAddress: string, investorId: string, tokens: bigint): Promise<void> {
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
