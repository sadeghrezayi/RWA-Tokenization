import type { Clock } from "../offerings/ports.js";
import { loadFundingRequest } from "./load-funding.js";
import type { FundingRepository } from "./ports.js";
import type { FundingRequestView } from "./funding-view.js";
import { toFundingView } from "./funding-view.js";

export class RejectFunding {
  constructor(
    private readonly funding: FundingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    requestId: string;
    reason: string;
    officerId: string;
  }): Promise<FundingRequestView> {
    const request = await loadFundingRequest(this.funding, input.requestId);
    const rejected = request.reject({ reason: input.reason, now: this.clock.now() });
    await this.funding.save(rejected);
    return toFundingView(rejected);
  }
}
