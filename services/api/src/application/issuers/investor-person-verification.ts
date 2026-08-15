import type { InvestorRepository } from "../identity/ports.js";
import type { PersonVerification } from "./ports.js";

// 3.2 / user decision 2026-08-15: every person acting for an issuer must be
// individually verified, not just the company.
//
// THIS IS WHERE "a person" ACQUIRES ITS MEANING. An issuer's person is a
// platform user who has completed the SAME individual verification as any
// investor — reusing the existing wizard, officer review and evidence store
// rather than standing up a second KYC pipeline for issuer staff.
//
// Composed over the investor repository rather than reading the table itself,
// so it cannot drift from how an investor is loaded anywhere else, and it
// answers with the domain's own rule (isEligibleForClaims) rather than
// re-deciding what "verified" means. An unknown person is NOT verified: the
// gate fails closed.
export class InvestorPersonVerification implements PersonVerification {
  constructor(private readonly investors: InvestorRepository) {}

  async isVerified(userId: string): Promise<boolean> {
    const investor = await this.investors.findById(userId);
    return investor?.isEligibleForClaims() ?? false;
  }
}
