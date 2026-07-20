import type { EmailAddress } from "../../domain/identity/email-address.js";
import type { Investor } from "../../domain/identity/investor.js";
import type { KycState } from "../../domain/identity/kyc-status.js";

export interface InvestorRepository {
  findById(id: string): Promise<Investor | undefined>;
  findByEmail(email: EmailAddress): Promise<Investor | undefined>;
  findByKycStates(states: readonly KycState[]): Promise<Investor[]>;
  findAll(): Promise<Investor[]>;
  save(investor: Investor): Promise<void>;
}

// FR-PT-3 admin directory reads: settlement balance and the investor's
// chain footprint (ONCHAINID + custodial wallet), both adapter-owned.
export interface LedgerReader {
  balanceOf(investorId: string): Promise<{ balanceRial: bigint; heldRial: bigint }>;
}

export interface InvestorChainInfo {
  identityAddress?: string;
  walletAddress?: string;
}

export interface InvestorChainDirectory {
  forInvestor(investorId: string): Promise<InvestorChainInfo>;
}

export interface IdGenerator {
  nextId(): string;
}

// FR-ID-3: issues the signed KYC claim onto the investor's on-chain identity.
// v1 adapter targets ONCHAINID on the Besu devnet; tests use a recording fake.
export interface ClaimIssuer {
  issueKycApprovedClaim(investorId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export type Principal =
  { kind: "investor"; investorId: string } | { kind: "officer"; officerId: string };

export interface TokenIssuer {
  issue(principal: Principal): Promise<string>;
}
