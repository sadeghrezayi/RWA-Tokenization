import type { RegistryEvent } from "../../src/domain/registry/holder-registry.js";
import type {
  TokenEventSource,
  WalletDirectory,
  WalletIdentity,
} from "../../src/application/registry/ports.js";
import type { AssetEvent, AssetEventLog } from "../../src/application/assets/ports.js";
import type {
  AssetEventReader,
  RecordedAssetEvent,
} from "../../src/application/reporting/ports.js";
import type { Clock } from "../../src/application/offerings/ports.js";

export class FakeTokenEventSource implements TokenEventSource {
  private readonly streams = new Map<string, RegistryEvent[]>();
  private readonly supplies = new Map<string, bigint>();

  seed(tokenAddress: string, events: RegistryEvent[], supply: bigint): void {
    this.streams.set(tokenAddress, events);
    this.supplies.set(tokenAddress, supply);
  }

  registryEvents(tokenAddress: string): Promise<RegistryEvent[]> {
    return Promise.resolve([...(this.streams.get(tokenAddress) ?? [])]);
  }

  totalSupply(tokenAddress: string): Promise<bigint> {
    return Promise.resolve(this.supplies.get(tokenAddress) ?? 0n);
  }
}

export class InMemoryWalletDirectory implements WalletDirectory {
  private readonly identities = new Map<string, WalletIdentity>();

  register(wallet: string, identity: WalletIdentity): void {
    this.identities.set(wallet.toLowerCase(), identity);
  }

  byWallet(): Promise<Map<string, WalletIdentity>> {
    return Promise.resolve(new Map(this.identities));
  }
}

// Append + read sides of the audit log in one fake, so use-case tests exercise
// the same rows the Prisma adapter would serve (LSP contract suite in
// integration tests pins matching semantics).
export class InMemoryAssetEventStore implements AssetEventLog, AssetEventReader {
  private sequence = 0;
  private readonly rows: RecordedAssetEvent[] = [];

  constructor(private readonly clock: Clock) {}

  append(event: AssetEvent): Promise<void> {
    this.sequence += 1;
    this.rows.push({
      id: String(this.sequence),
      assetId: event.assetId,
      event: event.event,
      actor: event.actor,
      details: event.details ?? {},
      at: this.clock.now(),
    });
    return Promise.resolve();
  }

  list(filter: { assetId?: string; limit?: number }): Promise<RecordedAssetEvent[]> {
    const matching = this.rows
      .filter((row) => filter.assetId === undefined || row.assetId === filter.assetId)
      .sort((a, b) =>
        a.at.getTime() === b.at.getTime()
          ? Number(b.id) - Number(a.id)
          : b.at.getTime() - a.at.getTime(),
      );
    return Promise.resolve(filter.limit === undefined ? matching : matching.slice(0, filter.limit));
  }
}
