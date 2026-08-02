import type { FundingRequest } from "../../domain/funding/funding-request.js";
import { FundingRequestNotFoundError } from "./errors.js";
import type { FundingRepository } from "./ports.js";

// `investorId` narrows to that investor's own requests. Absent for treasury,
// who may act on the whole queue.
export const loadFundingRequest = async (
  funding: FundingRepository,
  id: string,
  investorId?: string,
): Promise<FundingRequest> => {
  const request = await funding.findById(id);
  if (!request || (investorId !== undefined && request.investorId !== investorId)) {
    throw new FundingRequestNotFoundError(id);
  }
  return request;
};
