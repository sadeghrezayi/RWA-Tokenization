import type { FundingRequest } from "../../domain/funding/funding-request.js";
import type { CreditResult } from "../approvals/credit-investor-ledger.js";

export interface FundingRepository {
  findById(id: string): Promise<FundingRequest | undefined>;
  // Newest first: an investor reads their funding history from the most recent.
  findByInvestor(investorId: string): Promise<FundingRequest[]>;
  // Oldest first: treasury works a queue from the longest-waiting.
  findPending(): Promise<FundingRequest[]>;
  save(request: FundingRequest): Promise<void>;
}

// Where the money should be sent. Deployment configuration — this codebase does
// not know any real bank account, and the values REQUIRE LOCAL SETUP before the
// instructions shown to an investor mean anything.
export interface PaymentInstructions {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  notice: string;
}

// The existing maker-checker credit (1.4b), as a port so the funding module
// depends on the behaviour and not on the approvals wiring.
export interface LedgerCreditPort {
  execute(input: {
    investorId: string;
    amountRial: bigint;
    makerId: string;
  }): Promise<CreditResult>;
}
