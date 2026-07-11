import type { Offering } from "../../domain/offerings/offering.js";
import { OfferingNotFoundError } from "./errors.js";
import type { OfferingRepository } from "./ports.js";

export const loadOffering = async (
  offerings: OfferingRepository,
  offeringId: string,
): Promise<Offering> => {
  const offering = await offerings.findById(offeringId);
  if (!offering) {
    throw new OfferingNotFoundError(offeringId);
  }
  return offering;
};
