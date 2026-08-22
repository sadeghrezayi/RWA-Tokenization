import { KYC_CLAIM_OUTBOX_TYPE } from "../../application/identity/kyc-claim-outbox.js";
import type { ClaimIssuer } from "../../application/identity/ports.js";
import type { OutboxHandler } from "../../application/outbox/ports.js";

// Performs the chain write an approval asked for (P0-2). Throwing is how this
// says "not yet": the drainer reschedules with backoff and, after enough
// attempts, dead-letters the message where it can be seen — which is the whole
// reason the claim moved off the request path.
//
// Idempotency is the adapter's: OnchainidClaimIssuer deploys the ONCHAINID
// only if the investor has none, so a redelivered message re-adds a claim to
// the identity rather than creating a second one. At-least-once delivery is
// what the outbox promises, so being called twice must be survivable.
export class KycClaimOutboxHandler implements OutboxHandler {
  readonly type = KYC_CLAIM_OUTBOX_TYPE;

  constructor(private readonly claims: ClaimIssuer) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const { investorId } = payload;
    if (typeof investorId !== "string" || investorId === "") {
      // Malformed rather than transient: say so plainly, so the retries that
      // follow are read as "this will never work" rather than "the chain is
      // down".
      throw new Error(`invalid ${KYC_CLAIM_OUTBOX_TYPE} payload: expected { investorId: string }`);
    }
    await this.claims.issueKycApprovedClaim(investorId);
  }
}
