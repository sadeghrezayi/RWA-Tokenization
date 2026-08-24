import { KYC_CLAIM_TYPE } from "../../application/identity/approve-kyc.js";
import type { ClaimIssuer } from "../../application/identity/ports.js";
import type { OutboxHandler } from "../../application/outbox/ports.js";

// P0-2 step 4: performs a queued KYC claim.
//
// A still-unreachable chain is allowed to throw, which is how the drainer knows
// to schedule another attempt with backoff. If it never succeeds, the claim
// shows up in `approvedWithoutOnchainIdentity` on the health probe and
// ReissueKycClaim remains the manual lever (K-2).
export class KycClaimHandler implements OutboxHandler {
  readonly type = KYC_CLAIM_TYPE;

  constructor(private readonly claims: ClaimIssuer) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const investorId = payload.investorId;
    if (typeof investorId !== "string" || investorId.trim() === "") {
      throw new Error(`invalid ${KYC_CLAIM_TYPE} payload: "investorId" must be a non-empty string`);
    }
    await this.claims.issueKycApprovedClaim(investorId);
  }
}
