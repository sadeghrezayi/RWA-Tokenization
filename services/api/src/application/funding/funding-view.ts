import type { FundingRequest } from "../../domain/funding/funding-request.js";
import type { FundingStatus } from "../../domain/funding/funding-request.js";

export interface FundingRequestView {
  id: string;
  status: FundingStatus;
  amountRial: string;
  reference: string;
  requestedAt: string;
  settledAt?: string;
  settledAmountRial?: string;
  rejectionReason?: string;
}

export const toFundingView = (request: FundingRequest): FundingRequestView => ({
  id: request.id,
  status: request.status,
  amountRial: String(request.amountRial),
  reference: request.reference,
  requestedAt: request.requestedAt.toISOString(),
  // exactOptionalPropertyTypes: omit rather than set undefined.
  ...(request.settledAt !== undefined ? { settledAt: request.settledAt.toISOString() } : {}),
  ...(request.settledAmountRial !== undefined
    ? { settledAmountRial: String(request.settledAmountRial) }
    : {}),
  ...(request.rejectionReason !== undefined ? { rejectionReason: request.rejectionReason } : {}),
});
