import { loadInvestor } from "./load-investor.js";
import type { InvestorRepository, KycDecisionNotifier } from "./ports.js";

export class RejectKyc {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly notifier: KycDecisionNotifier,
  ) {}

  async execute(input: { investorId: string; reason: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const rejected = investor.rejectKyc(input.reason);
    await this.investors.save(rejected);
    // 1.7c-ii: tell the investor the outcome, including why (in-app + email).
    await this.notifier.kycDecided({
      investorId: rejected.id,
      email: rejected.email.value,
      decision: "rejected",
      reason: input.reason,
    });
  }
}
