import type { Clock } from "../offerings/ports.js";
import { loadFundingRequest } from "./load-funding.js";
import type { FundingRepository } from "./ports.js";
import type { FundingRequestView } from "./funding-view.js";
import { toFundingView } from "./funding-view.js";

export class CancelFunding {
  constructor(
    private readonly funding: FundingRepository,
    private readonly clock: Clock,
  ) {}

  // Scoped to the investor's own requests: cancelling is theirs to do, and one
  // investor must not be able to touch another's.
  async execute(input: { requestId: string; investorId: string }): Promise<FundingRequestView> {
    const request = await loadFundingRequest(this.funding, input.requestId, input.investorId);
    const cancelled = request.cancel(this.clock.now());
    await this.funding.save(cancelled);
    return toFundingView(cancelled);
  }
}
