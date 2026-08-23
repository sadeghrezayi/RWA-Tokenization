import type { IssuerStateDto } from "../../lib/api";

// The organisation state machine, as the UI is allowed to act on it. ONE
// definition, shared by the queue and the detail-page workspace: offering an
// action the server answers with a 409 is a fake button, and two copies of
// these rules would eventually disagree about which button that is.
//
// Mirrors `IssuerOrganisation` in the domain: applied → in_review →
// approved | rejected; approved → suspended; suspended → approved. Rejection is
// terminal, because re-applying should be a new application.
export const canStartReview = (state: IssuerStateDto): boolean => state === "applied";
export const canDecide = (state: IssuerStateDto): boolean => state === "in_review";
export const canSuspend = (state: IssuerStateDto): boolean => state === "approved";
export const canReinstate = (state: IssuerStateDto): boolean => state === "suspended";

export const hasAnyAction = (state: IssuerStateDto): boolean =>
  canStartReview(state) || canDecide(state) || canSuspend(state) || canReinstate(state);
