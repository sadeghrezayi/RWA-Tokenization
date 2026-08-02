import type { InvestorRepository } from "../identity/ports.js";
import type { FundingRepository } from "./ports.js";
import type { FundingRequestView } from "./funding-view.js";
import { toFundingView } from "./funding-view.js";

export class ListMyFunding {
  constructor(private readonly funding: FundingRepository) {}

  async execute(input: { investorId: string }): Promise<FundingRequestView[]> {
    const requests = await this.funding.findByInvestor(input.investorId);
    return requests.map(toFundingView);
  }
}

export interface PendingFundingView extends FundingRequestView {
  investorId: string;
  // A treasury officer reads this beside a bank statement; a UUID tells them
  // nothing about whose payment they are looking at.
  investorEmail: string;
}

export class ListPendingFunding {
  constructor(
    private readonly funding: FundingRepository,
    private readonly investors: InvestorRepository,
  ) {}

  async execute(): Promise<PendingFundingView[]> {
    const pending = await this.funding.findPending();
    const views: PendingFundingView[] = [];
    for (const request of pending) {
      const investor = await this.investors.findById(request.investorId);
      views.push({
        ...toFundingView(request),
        investorId: request.investorId,
        investorEmail: investor?.email.value ?? request.investorId,
      });
    }
    return views;
  }
}
