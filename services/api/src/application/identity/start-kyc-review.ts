import { loadInvestor } from "./load-investor.js";
import type { InvestorRepository } from "./ports.js";

export class StartKycReview {
  constructor(private readonly investors: InvestorRepository) {}

  async execute(input: { investorId: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    await this.investors.save(investor.startKycReview());
  }
}
