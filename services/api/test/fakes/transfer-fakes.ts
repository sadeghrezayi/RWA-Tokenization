import type { TokenTransfer } from "../../src/domain/transfers/token-transfer.js";
import type {
  AssetTokenTransferrer,
  TransferRepository,
} from "../../src/application/transfers/ports.js";

export class InMemoryTransferRepository implements TransferRepository {
  private readonly items: TokenTransfer[] = [];
  failNextSave: Error | undefined;

  save(transfer: TokenTransfer): Promise<void> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      return Promise.reject(error);
    }
    this.items.push(transfer);
    return Promise.resolve();
  }

  findByAsset(assetId: string): Promise<TokenTransfer[]> {
    return Promise.resolve(this.items.filter((t) => t.assetId === assetId));
  }

  findByInvestor(investorId: string): Promise<TokenTransfer[]> {
    return Promise.resolve(
      this.items.filter((t) => t.fromInvestorId === investorId || t.toInvestorId === investorId),
    );
  }
}

// In-memory twin of the on-chain token: balances per investor, with a set of
// recipients the "chain" will reject (simulating an ERC-3643 compliance revert).
export class FakeAssetTokenTransferrer implements AssetTokenTransferrer {
  private readonly balances = new Map<string, bigint>();
  readonly transfers: { from: string; to: string; tokens: bigint }[] = [];
  readonly rejectRecipients = new Set<string>();

  credit(investorId: string, tokens: bigint): void {
    this.balances.set(investorId, (this.balances.get(investorId) ?? 0n) + tokens);
  }

  reset(): void {
    this.balances.clear();
    this.transfers.length = 0;
    this.rejectRecipients.clear();
  }

  balanceOf(_tokenAddress: string, investorId: string): Promise<bigint> {
    return Promise.resolve(this.balances.get(investorId) ?? 0n);
  }

  transfer(
    _tokenAddress: string,
    fromInvestorId: string,
    toInvestorId: string,
    tokens: bigint,
  ): Promise<void> {
    if (this.rejectRecipients.has(toInvestorId)) {
      return Promise.reject(new Error("transfer rejected on-chain: recipient not verified"));
    }
    this.balances.set(fromInvestorId, (this.balances.get(fromInvestorId) ?? 0n) - tokens);
    this.balances.set(toInvestorId, (this.balances.get(toInvestorId) ?? 0n) + tokens);
    this.transfers.push({ from: fromInvestorId, to: toInvestorId, tokens });
    return Promise.resolve();
  }
}
