import type { EmailAddress } from "../../domain/identity/email-address.js";
import type { Investor } from "../../domain/identity/investor.js";
import type { KycState } from "../../domain/identity/kyc-status.js";
import type { LoginThrottle } from "../../domain/identity/login-throttle.js";

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

// T4: persistent per-account login-throttle state (account lockout survives
// restarts). Keyed by the normalized login identifier (lowercased email).
export interface LoginAttemptStore {
  load(key: string): Promise<LoginThrottle>;
  save(key: string, throttle: LoginThrottle): Promise<void>;
}

// High-entropy random token generator for out-of-band secrets (password-reset
// links). The raw value is mailed once; only its digest is persisted.
export interface TokenGenerator {
  generate(): string;
}

// Outbound transactional email. Real SMTP adapter is deferred to deployment
// (OD-7); the dev adapter writes to a sink so links are recoverable locally.
export interface EmailSender {
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendEmailVerification(to: string, token: string): Promise<void>;
}

// A single-use out-of-band grant (password-reset, email-verification): only the
// token's digest is stored (T14), never the raw token. Platform-level (not
// tenant-scoped) — keyed by the digest.
export interface SingleUseTokenRecord {
  tokenHash: string;
  investorId: string;
  expiresAt: Date;
  usedAt?: Date;
}

export interface SingleUseTokenStore {
  save(record: SingleUseTokenRecord): Promise<void>;
  // Valid = matching digest, not yet used, not past its expiry at `now`.
  findValid(tokenHash: string, now: Date): Promise<SingleUseTokenRecord | undefined>;
  markUsed(tokenHash: string, at: Date): Promise<void>;
  // Invalidate every outstanding grant for an investor (used on redemption so a
  // second in-flight link cannot be replayed after the account state changed).
  invalidateForInvestor(investorId: string, at: Date): Promise<void>;
}

// One store shape, two backing tables (distinct so a reset link can't be
// redeemed as a verification link or vice-versa). Named aliases keep call sites
// self-documenting.
export type PasswordResetTokenRecord = SingleUseTokenRecord;
export type PasswordResetTokenStore = SingleUseTokenStore;
export type EmailVerificationTokenRecord = SingleUseTokenRecord;
export type EmailVerificationTokenStore = SingleUseTokenStore;
