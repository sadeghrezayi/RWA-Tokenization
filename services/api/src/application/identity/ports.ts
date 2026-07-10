import type { EmailAddress } from "../../domain/identity/email-address.js";
import type { Investor } from "../../domain/identity/investor.js";

export interface InvestorRepository {
  findById(id: string): Promise<Investor | undefined>;
  findByEmail(email: EmailAddress): Promise<Investor | undefined>;
  save(investor: Investor): Promise<void>;
}

export interface IdGenerator {
  nextId(): string;
}

// FR-ID-3: issues the signed KYC claim onto the investor's on-chain identity.
// v1 adapter targets ONCHAINID on the Besu devnet; tests use a recording fake.
export interface ClaimIssuer {
  issueKycApprovedClaim(investorId: string): Promise<void>;
}
