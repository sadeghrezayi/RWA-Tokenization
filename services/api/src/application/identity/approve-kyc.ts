import { loadInvestor } from "./load-investor.js";
import type { ClaimIssuer, InvestorRepository, KycDecisionNotifier } from "./ports.js";
import type { OutboxEnqueue } from "../outbox/ports.js";

// P0-2 step 4: the queued retry of a KYC claim.
export const KYC_CLAIM_TYPE = "identity.issue_kyc_claim";

export class ApproveKyc {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly claims: ClaimIssuer,
    private readonly notifier: KycDecisionNotifier,
    private readonly outbox: OutboxEnqueue,
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
      // P0-2 step 4: the claim retries itself rather than failing the request.
      //
      // This used to throw, so a devnet hiccup turned a KYC approval into a 503
      // an officer had to notice and retry by hand. The compliance decision is
      // committed either way, so failing added noise rather than safety.
      //
      // It was only safe to defer once the close-time mint could survive it
      // (step 2): a mint that arrives before the claim has drained now retries
      // instead of failing the close. That ordering is what reverted the
      // previous attempt at this.
      //
      // A claim that NEVER lands is still visible — `approvedWithoutOnchainIdentity`
      // on the health probe counts exactly this — and ReissueKycClaim remains
      // the manual lever (K-2).
      await this.outbox.enqueue({
        type: KYC_CLAIM_TYPE,
        payload: {
          investorId: approved.id,
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      });
    }
  }
}
