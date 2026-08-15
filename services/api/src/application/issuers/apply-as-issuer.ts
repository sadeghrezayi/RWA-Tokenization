import { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";
import type { Clock } from "../offerings/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import type { IssuerRepository } from "./ports.js";

// An organisation applies. It can do nothing until a person has approved it —
// the default is never "allowed to raise money from the public".
export class ApplyAsIssuer {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    legalName: string;
    registrationNumber: string;
    contactEmail: string;
  }): Promise<{ organisationId: string }> {
    const organisation = IssuerOrganisation.apply({
      id: this.ids.nextId(),
      legalName: input.legalName,
      registrationNumber: input.registrationNumber,
      contactEmail: input.contactEmail,
      appliedAt: this.clock.now(),
    });
    await this.issuers.save(organisation);
    return { organisationId: organisation.id };
  }
}
