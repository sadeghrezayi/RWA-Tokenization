import { FundingRequest } from "../../domain/funding/funding-request.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { IdGenerator, InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import { newPaymentReference } from "./payment-reference.js";
import type { FundingRepository, PaymentInstructions } from "./ports.js";
import type { FundingRequestView } from "./funding-view.js";
import { toFundingView } from "./funding-view.js";

// OD-6: the investor declares what they are about to transfer and gets back a
// reference to quote. Nothing moves until treasury confirms a matching credit.
export class RequestFunding {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly funding: FundingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly instructions: PaymentInstructions,
  ) {}

  async execute(input: { investorId: string; amountRial: bigint }): Promise<{
    request: FundingRequestView;
    instructions: PaymentInstructions;
  }> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const request = FundingRequest.open({
      id: this.ids.nextId(),
      investorId: investor.id,
      amountRial: input.amountRial,
      reference: newPaymentReference(),
      now: this.clock.now(),
    });
    await this.funding.save(request);
    return { request: toFundingView(request), instructions: this.instructions };
  }
}
