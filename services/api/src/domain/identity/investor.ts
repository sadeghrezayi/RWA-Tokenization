import type { EmailAddress } from "./email-address.js";
import type { PasswordHash } from "./password-hash.js";
import { KycStatus } from "./kyc-status.js";

export class Investor {
  private constructor(
    public readonly id: string,
    public readonly email: EmailAddress,
    public readonly passwordHash: PasswordHash,
    public readonly kycStatus: KycStatus,
  ) {}

  static register(id: string, email: EmailAddress, passwordHash: PasswordHash): Investor {
    return new Investor(id, email, passwordHash, KycStatus.draft());
  }

  // Persistence-only: rehydrates a stored investor without replaying transitions.
  static restore(
    id: string,
    email: EmailAddress,
    passwordHash: PasswordHash,
    kycStatus: KycStatus,
  ): Investor {
    return new Investor(id, email, passwordHash, kycStatus);
  }

  submitKyc(): Investor {
    return this.withKyc(this.kycStatus.submit());
  }

  startKycReview(): Investor {
    return this.withKyc(this.kycStatus.startReview());
  }

  approveKyc(): Investor {
    return this.withKyc(this.kycStatus.approve());
  }

  rejectKyc(reason: string): Investor {
    return this.withKyc(this.kycStatus.reject(reason));
  }

  expireKyc(): Investor {
    return this.withKyc(this.kycStatus.expire());
  }

  // FR-ID-3: on-chain claims are issued only against an approved KYC.
  isEligibleForClaims(): boolean {
    return this.kycStatus.state === "approved";
  }

  private withKyc(kycStatus: KycStatus): Investor {
    return new Investor(this.id, this.email, this.passwordHash, kycStatus);
  }
}
