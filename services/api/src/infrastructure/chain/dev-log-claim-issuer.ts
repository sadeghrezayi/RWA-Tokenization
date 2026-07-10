import { Logger } from "@nestjs/common";
import type { ClaimIssuer } from "../../application/identity/ports.js";

// Placeholder adapter until the ONCHAINID/Besu claim issuer lands (Phase 1,
// contracts step). Logs instead of touching a chain so the API flow is complete.
export class DevLogClaimIssuer implements ClaimIssuer {
  private readonly logger = new Logger(DevLogClaimIssuer.name);

  issueKycApprovedClaim(investorId: string): Promise<void> {
    this.logger.log(`KYC-approved claim pending on-chain issuance for investor ${investorId}`);
    return Promise.resolve();
  }
}
