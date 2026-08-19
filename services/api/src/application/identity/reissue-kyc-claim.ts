import { InvalidKycTransitionError } from "../../domain/identity/errors.js";
import { ClaimIssuanceFailedError } from "./errors.js";
import { loadInvestor } from "./load-investor.js";
import type { ClaimIssuer, InvestorRepository } from "./ports.js";

// K-2's remainder: the recovery path for an approval whose on-chain claim did
// not issue.
//
// The compliance decision is committed before the chain is touched, on purpose
// — a devnet outage must never revert an approval. The cost is that an outage
// can leave someone APPROVED WITH NO CLAIM, and until this existed there was
// no way back: `issueKycApprovedClaim` was reachable only from the approval
// transition, which runs once. ERC-3643 refuses transfers to an unverified
// wallet, so such an investor could never hold anything.
//
// This recovers the chain half and touches nothing else. It does not decide
// anything: the decision was made when the officer approved, and it stands.
export class ReissueKycClaim {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly claims: ClaimIssuer,
  ) {}

  async execute(input: { investorId: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    if (investor.kycStatus.state !== "approved") {
      // Not a claim to reissue: nothing has been decided for this person yet,
      // and issuing a KYC-approved claim would assert on chain that it had.
      throw new InvalidKycTransitionError(
        `cannot reissue a KYC claim for an investor whose decision is "${investor.kycStatus.state}"`,
      );
    }
    try {
      await this.claims.issueKycApprovedClaim(investor.id);
    } catch (reason) {
      throw new ClaimIssuanceFailedError(reason);
    }
  }
}
