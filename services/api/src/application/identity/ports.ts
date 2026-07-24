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

// T1/T4 MFA: TOTP crypto (RFC 6238), provided by the otplib adapter. The domain
// never sees the algorithm — only "make a secret", "make a provisioning URI",
// "does this 6-digit code match the secret right now".
export interface TotpService {
  generateSecret(): string;
  keyUri(secret: string, accountName: string): string;
  verify(secret: string, code: string): Promise<boolean>;
}

export type MfaStatus = "pending" | "active";

// Persistent per-principal MFA enrollment. Platform-level (pre-session for the
// login challenge), keyed by the principal id (officer id today; staff/user id
// after 1.4). The shared secret must be recoverable to verify codes, so it is
// stored reversibly — encryption-at-rest is a T14/Phase-8 item, tracked there.
// Recovery codes are single-use and stored only as digests.
export interface MfaEnrollment {
  secret: string;
  status: MfaStatus;
  recoveryCodeHashes: string[];
}

export interface MfaStore {
  load(principalId: string): Promise<MfaEnrollment | undefined>;
  save(principalId: string, enrollment: MfaEnrollment): Promise<void>;
  delete(principalId: string): Promise<void>;
}

// Single-use human-typeable backup codes handed out once at enrollment.
export interface RecoveryCodeGenerator {
  generate(count: number): string[];
}

// Short-lived, purpose-scoped token proving the password step of a two-step
// officer login succeeded. It is NOT a session (carries no Principal), so it
// cannot access resources — only be redeemed for the MFA step.
export interface MfaChallengeIssuer {
  issue(principalId: string): Promise<string>;
  verify(token: string): Promise<string | undefined>;
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
