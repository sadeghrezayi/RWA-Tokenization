import type { Clock } from "../offerings/ports.js";
import { loadIssuer } from "./load-issuer.js";
import type { IssuerRepository } from "./ports.js";

// The platform's side of issuer onboarding: look at it, then decide. Every
// decision carries the officer who made it, so it is auditable.
export class DecideIssuerApplication {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly clock: Clock,
  ) {}

  async startReview(input: { organisationId: string }): Promise<void> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    await this.issuers.save(organisation.startReview(this.clock.now()));
  }

  async approve(input: { organisationId: string; officerId: string }): Promise<void> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    await this.issuers.save(organisation.approve(this.clock.now(), input.officerId));
  }

  async reject(input: {
    organisationId: string;
    officerId: string;
    reason: string;
  }): Promise<void> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    await this.issuers.save(organisation.reject(this.clock.now(), input.officerId, input.reason));
  }

  async suspend(input: {
    organisationId: string;
    officerId: string;
    reason: string;
  }): Promise<void> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    await this.issuers.save(organisation.suspend(this.clock.now(), input.officerId, input.reason));
  }

  async reinstate(input: { organisationId: string; officerId: string }): Promise<void> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    await this.issuers.save(organisation.reinstate(this.clock.now(), input.officerId));
  }
}
