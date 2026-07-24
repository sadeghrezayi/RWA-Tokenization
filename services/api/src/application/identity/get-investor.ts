import type { Investor } from "../../domain/identity/investor.js";
import type { KycState } from "../../domain/identity/kyc-status.js";
import { loadInvestor } from "./load-investor.js";
import type { InvestorRepository } from "./ports.js";

// Read-model shape shared by every identity query; never exposes credentials.
export interface InvestorView {
  id: string;
  email: string;
  emailVerified: boolean;
  kycState: KycState;
  kycRejectionReason?: string;
  eligibleForClaims: boolean;
}

export const toInvestorView = (investor: Investor): InvestorView => {
  const reason = investor.kycStatus.rejectionReason;
  return {
    id: investor.id,
    email: investor.email.value,
    emailVerified: investor.emailVerified,
    kycState: investor.kycStatus.state,
    eligibleForClaims: investor.isEligibleForClaims(),
    ...(reason !== undefined ? { kycRejectionReason: reason } : {}),
  };
};

export class GetInvestor {
  constructor(private readonly investors: InvestorRepository) {}

  async execute(input: { investorId: string }): Promise<InvestorView> {
    return toInvestorView(await loadInvestor(this.investors, input.investorId));
  }
}
