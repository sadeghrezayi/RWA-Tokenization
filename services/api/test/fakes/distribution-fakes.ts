import type { Distribution, HolderShare } from "../../src/domain/distributions/distribution.js";
import type {
  DistributionLedger,
  DistributionRepository,
  HolderSnapshotProvider,
} from "../../src/application/distributions/ports.js";

export class InMemoryDistributionRepository implements DistributionRepository {
  private readonly byId = new Map<string, Distribution>();
  failNextSave: Error | undefined;

  findById(id: string): Promise<Distribution | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findAll(): Promise<Distribution[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  save(distribution: Distribution): Promise<void> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      return Promise.reject(error);
    }
    this.byId.set(distribution.id, distribution);
    return Promise.resolve();
  }
}

export class StubHolderSnapshotProvider implements HolderSnapshotProvider {
  constructor(private holders: HolderShare[] = []) {}

  set(holders: HolderShare[]): void {
    this.holders = holders;
  }

  snapshot(): Promise<HolderShare[]> {
    return Promise.resolve([...this.holders]);
  }
}

export class RecordingDistributionLedger implements DistributionLedger {
  readonly credited: { investorId: string; amountRial: bigint }[] = [];

  payout(investorId: string, amountRial: bigint): Promise<void> {
    this.credited.push({ investorId, amountRial });
    return Promise.resolve();
  }
}
