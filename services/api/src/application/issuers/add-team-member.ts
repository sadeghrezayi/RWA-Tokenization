import { IssuerMembership } from "../../domain/issuers/issuer-membership.js";
import type { IssuerRole } from "../../domain/issuers/issuer-membership.js";
import type { Clock } from "../offerings/ports.js";
import { PersonNotVerifiedError } from "./errors.js";
import { loadIssuer } from "./load-issuer.js";
import type { IssuerRepository, PersonVerification } from "./ports.js";

// User decision (2026-08-15): verifying the company is not enough. Every person
// who acts for an issuer must have completed individual verification, so this
// is where that gate lives — refused before anything is written.
export class AddTeamMember {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly verification: PersonVerification,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    organisationId: string;
    userId: string;
    role: IssuerRole;
  }): Promise<void> {
    await loadIssuer(this.issuers, input.organisationId);
    if (!(await this.verification.isVerified(input.userId))) {
      throw new PersonNotVerifiedError(input.userId);
    }
    await this.issuers.addMember(
      IssuerMembership.of({
        organisationId: input.organisationId,
        userId: input.userId,
        role: input.role,
        addedAt: this.clock.now(),
      }),
    );
  }
}
