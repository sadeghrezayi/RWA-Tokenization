import type { Investor } from "../../domain/identity/investor.js";
import { InvestorNotFoundError } from "./errors.js";
import type { InvestorRepository } from "./ports.js";

export const loadInvestor = async (
  investors: InvestorRepository,
  investorId: string,
): Promise<Investor> => {
  const investor = await investors.findById(investorId);
  if (!investor) {
    throw new InvestorNotFoundError(investorId);
  }
  return investor;
};
