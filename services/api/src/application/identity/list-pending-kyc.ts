import { toInvestorView } from "./get-investor.js";
import type { InvestorView } from "./get-investor.js";
import type { InvestorRepository } from "./ports.js";

// FR-ID-4: the compliance officer's review queue.
export class ListPendingKyc {
  constructor(private readonly investors: InvestorRepository) {}

  async execute(): Promise<InvestorView[]> {
    const pending = await this.investors.findByKycStates(["submitted", "in_review"]);
    return pending.map(toInvestorView);
  }
}
