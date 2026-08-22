import type { NewOutboxMessage } from "../outbox/ports.js";

// P0-2 for the KYC claim. Decision B7: the transactional outbox is the
// durability mechanism for side effects, whatever triggers them — so the claim
// is enqueued in the same transaction as the approval and performed by the
// drainer, with its retry/backoff and dead-lettering.
//
// What this buys: an officer's approval no longer fails because a devnet is
// unreachable (K-2/K-30), and the claim is no longer lost because it was.
export const KYC_CLAIM_OUTBOX_TYPE = "kyc.claim.issue";

export const kycClaimMessage = (investorId: string): NewOutboxMessage => ({
  type: KYC_CLAIM_OUTBOX_TYPE,
  payload: { investorId },
});
