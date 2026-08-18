import type { BadgeTone } from "./badge";
import type { Dictionary } from "../../lib/i18n";
import type { IssuerStateDto } from "../../lib/api";

// One vocabulary for an organisation's state, shared by the platform's review
// queue and the issuer's own portal. Two copies would let an officer and an
// issuer describe the same organisation with different words — which is how a
// support call starts.
export const issuerStateLabel = (t: Dictionary, state: IssuerStateDto): string =>
  ({
    applied: t.issuersStateApplied,
    in_review: t.issuersStateInReview,
    approved: t.issuersStateApproved,
    rejected: t.issuersStateRejected,
    suspended: t.issuersStateSuspended,
  })[state];

export const issuerStateTone = (state: IssuerStateDto): BadgeTone =>
  ({
    applied: "neutral" as const,
    in_review: "info" as const,
    approved: "success" as const,
    rejected: "danger" as const,
    suspended: "warning" as const,
  })[state];
