import type { Clock } from "../offerings/ports.js";
import type { CreditResult } from "../approvals/credit-investor-ledger.js";
import { loadFundingRequest } from "./load-funding.js";
import type { FundingRepository, LedgerCreditPort } from "./ports.js";
import type { FundingRequestView } from "./funding-view.js";
import { toFundingView } from "./funding-view.js";

// Treasury has found the credit on a bank statement. The RECEIVED amount is
// what reaches the ledger — a bank credits what was actually sent, not what the
// investor declared.
export class ConfirmFunding {
  constructor(
    private readonly funding: FundingRepository,
    private readonly credit: LedgerCreditPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    requestId: string;
    receivedRial: bigint;
    officerId: string;
  }): Promise<{ request: FundingRequestView; creditStatus: CreditResult }> {
    const request = await loadFundingRequest(this.funding, input.requestId);
    // The transition is computed first so an already-settled request is refused
    // before any money is credited.
    const confirmed = request.confirm({ receivedRial: input.receivedRial, now: this.clock.now() });

    // Credit BEFORE recording the confirmation: if the ledger write fails the
    // request stays pending and treasury can retry, rather than reading as
    // settled while the balance says otherwise.
    const creditStatus = await this.credit.execute({
      investorId: request.investorId,
      amountRial: input.receivedRial,
      makerId: input.officerId,
    });
    await this.funding.save(confirmed);

    return { request: toFundingView(confirmed), creditStatus };
  }
}
