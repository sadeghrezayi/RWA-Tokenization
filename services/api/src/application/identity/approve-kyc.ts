import { loadInvestor } from "./load-investor.js";
import type { ClaimIssuer, InvestorRepository } from "./ports.js";

export class ApproveKyc {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly claims: ClaimIssuer,
  ) {}

  async execute(input: { investorId: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const approved = investor.approveKyc();
    // Persist the compliance decision before touching the chain: a devnet outage
    // must not revert an approval; claim issuance is retryable (FR-ID-3).
    await this.investors.save(approved);
    await this.claims.issueKycApprovedClaim(approved.id);
  }
}
