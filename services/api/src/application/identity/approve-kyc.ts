import { loadInvestor } from "./load-investor.js";
import { kycClaimMessage } from "./kyc-claim-outbox.js";
import type { OutboxEnqueue } from "../outbox/ports.js";
import type { InvestorRepository, KycDecisionNotifier } from "./ports.js";

export class ApproveKyc {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly outbox: OutboxEnqueue,
    private readonly notifier: KycDecisionNotifier,
  ) {}

  async execute(input: { investorId: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const approved = investor.approveKyc();
    // Persist the compliance decision before touching the chain: a devnet outage
    // must not revert an approval; claim issuance is retryable (FR-ID-3).
    await this.investors.save(approved);
    // 1.7c-ii: tell the investor the outcome (in-app + email). BEFORE the
    // chain, because the decision is already committed: a devnet outage used
    // to abort this line, leaving a person approved and never told (K-2).
    await this.notifier.kycDecided({
      investorId: approved.id,
      email: approved.email.value,
      decision: "approved",
    });
    // P0-2: the chain write is ENQUEUED, not performed here. The drainer
    // issues it with retry and backoff, so a devnet outage delays the claim
    // instead of failing an approval that has already been decided — and a
    // claim that keeps failing dead-letters where it can be seen, rather than
    // vanishing into a 500 (K-2, K-30).
    await this.outbox.enqueue(kycClaimMessage(approved.id));
  }
}
