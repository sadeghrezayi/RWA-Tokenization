import { IssuerMembership } from "../../domain/issuers/issuer-membership.js";
import type { IssuerRole } from "../../domain/issuers/issuer-membership.js";
import type { Clock } from "../offerings/ports.js";
import { PersonNotFoundError } from "./errors.js";
import { loadIssuer } from "./load-issuer.js";
import type { IssuerRepository, PersonDirectory, PersonVerification } from "./ports.js";
import { requireVerifiedPerson } from "./require-verified-person.js";

// A colleague is invited by email, because that is how people know each other —
// nobody can be asked for a teammate's UUID.
//
// User decision (2026-08-15): verifying the company is not enough. Every person
// who acts for an issuer must have completed individual verification, so the
// invitation is refused before anything is written.
export class AddTeamMember {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly people: PersonDirectory,
    private readonly verification: PersonVerification,
    private readonly clock: Clock,
  ) {}

  async execute(input: { organisationId: string; email: string; role: IssuerRole }): Promise<void> {
    await loadIssuer(this.issuers, input.organisationId);
    const userId = await this.people.findIdByEmail(input.email);
    if (userId === undefined) {
      throw new PersonNotFoundError(input.email.trim());
    }
    await requireVerifiedPerson(this.verification, userId, input.email.trim());
    await this.issuers.addMember(
      IssuerMembership.of({
        organisationId: input.organisationId,
        userId,
        role: input.role,
        addedAt: this.clock.now(),
      }),
    );
  }
}
