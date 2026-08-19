import { loadInvestor } from "./load-investor.js";
import { ClaimIssuanceFailedError } from "./errors.js";
import type { ClaimIssuer, InvestorRepository, KycDecisionNotifier } from "./ports.js";

export class ApproveKyc {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly claims: ClaimIssuer,
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
    try {
      await this.claims.issueKycApprovedClaim(approved.id);
    } catch (cause) {
      // Still a failure — the officer must not be told everything worked —
      // but one that says which part failed and what is left to do.
      throw new ClaimIssuanceFailedError(cause);
    }
  }
}
