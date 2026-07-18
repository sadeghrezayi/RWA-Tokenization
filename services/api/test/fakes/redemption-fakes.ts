import type { Redemption } from "../../src/domain/redemptions/redemption.js";
import type {
  AssetTokenBurner,
  RedemptionLedger,
  RedemptionRepository,
} from "../../src/application/redemptions/ports.js";

export class InMemoryRedemptionRepository implements RedemptionRepository {
  private readonly byId = new Map<string, Redemption>();

  findById(id: string): Promise<Redemption | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findAll(): Promise<Redemption[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  findByInvestor(investorId: string): Promise<Redemption[]> {
    return Promise.resolve([...this.byId.values()].filter((r) => r.investorId === investorId));
  }

  save(redemption: Redemption): Promise<void> {
    this.byId.set(redemption.id, redemption);
    return Promise.resolve();
  }
}

export class RecordingAssetTokenBurner implements AssetTokenBurner {
  readonly burned: { tokenAddress: string; investorId: string; tokens: bigint }[] = [];
  failWith: Error | undefined;

  burn(tokenAddress: string, investorId: string, tokens: bigint): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.burned.push({ tokenAddress, investorId, tokens });
    return Promise.resolve();
  }
}

export class RecordingRedemptionLedger implements RedemptionLedger {
  readonly credited: { investorId: string; amountRial: bigint }[] = [];

  credit(investorId: string, amountRial: bigint): Promise<void> {
    this.credited.push({ investorId, amountRial });
    return Promise.resolve();
  }
}
