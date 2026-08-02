import type { FundingRequest } from "../../src/domain/funding/funding-request.js";
import type { CreditResult } from "../../src/application/approvals/credit-investor-ledger.js";
import type { FundingRepository, LedgerCreditPort } from "../../src/application/funding/ports.js";

export class InMemoryFundingRepository implements FundingRepository {
  private readonly byId = new Map<string, FundingRequest>();

  findById(id: string): Promise<FundingRequest | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByInvestor(investorId: string): Promise<FundingRequest[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((request) => request.investorId === investorId)
        // Newest first, with a stable tiebreak: two requests can share a
        // millisecond, and an arbitrary order would make the list flicker.
        .sort(
          (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime() || b.id.localeCompare(a.id),
        ),
    );
  }

  findPending(): Promise<FundingRequest[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((request) => request.status === "pending")
        .sort(
          (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime() || a.id.localeCompare(b.id),
        ),
    );
  }

  save(request: FundingRequest): Promise<void> {
    this.byId.set(request.id, request);
    return Promise.resolve();
  }
}

// Stands in for the maker-checker credit use case, so funding tests can assert
// what the ledger was asked to do without the approvals stack.
export class RecordingLedgerCredit implements LedgerCreditPort {
  readonly calls: { investorId: string; amountRial: bigint; makerId: string }[] = [];
  nextResult: CreditResult = { status: "credited" };
  failNext: Error | undefined;

  execute(input: {
    investorId: string;
    amountRial: bigint;
    makerId: string;
  }): Promise<CreditResult> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      return Promise.reject(error);
    }
    this.calls.push({ ...input });
    return Promise.resolve(this.nextResult);
  }
}
