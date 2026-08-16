import { IssuerMembership } from "../../domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";
import type { Clock } from "../offerings/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import type { IssuerRepository, PersonVerification } from "./ports.js";
import { requireVerifiedPerson } from "./require-verified-person.js";

// An organisation applies. It can do nothing until a person has approved it —
// the default is never "allowed to raise money from the public".
//
// The applicant is the first person acting for the organisation, so they become
// its administrator: an approved issuer with nobody able to staff it would be
// dependent on the platform for every colleague it ever adds. They are held to
// the same individual verification as anyone else joining the team.
export class ApplyAsIssuer {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly verification: PersonVerification,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    applicantUserId: string;
    legalName: string;
    registrationNumber: string;
    contactEmail: string;
  }): Promise<{ organisationId: string }> {
    await requireVerifiedPerson(this.verification, input.applicantUserId);
    const now = this.clock.now();
    const organisation = IssuerOrganisation.apply({
      id: this.ids.nextId(),
      legalName: input.legalName,
      registrationNumber: input.registrationNumber,
      contactEmail: input.contactEmail,
      appliedAt: now,
    });
    await this.issuers.save(organisation);
    await this.issuers.addMember(
      IssuerMembership.of({
        organisationId: organisation.id,
        userId: input.applicantUserId,
        role: "issuer_admin",
        addedAt: now,
      }),
    );
    return { organisationId: organisation.id };
  }
}
