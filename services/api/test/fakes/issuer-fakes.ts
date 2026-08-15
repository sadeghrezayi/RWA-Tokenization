import type { IssuerMembership } from "../../src/domain/issuers/issuer-membership.js";
import type { IssuerOrganisation } from "../../src/domain/issuers/issuer-organisation.js";
import type { IssuerRepository } from "../../src/application/issuers/ports.js";

const key = (organisationId: string, userId: string) => `${organisationId}|${userId}`;

export class InMemoryIssuerRepository implements IssuerRepository {
  private readonly byId = new Map<string, IssuerOrganisation>();
  private readonly members = new Map<string, IssuerMembership>();

  findById(id: string): Promise<IssuerOrganisation | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findAll(): Promise<IssuerOrganisation[]> {
    return Promise.resolve([...this.byId.values()]);
  }

  save(organisation: IssuerOrganisation): Promise<void> {
    this.byId.set(organisation.id, organisation);
    return Promise.resolve();
  }

  addMember(membership: IssuerMembership): Promise<void> {
    // One membership per person per organisation: adding again changes the
    // role rather than listing them twice.
    this.members.set(key(membership.organisationId, membership.userId), membership);
    return Promise.resolve();
  }

  removeMember(organisationId: string, userId: string): Promise<void> {
    this.members.delete(key(organisationId, userId));
    return Promise.resolve();
  }

  membersOf(organisationId: string): Promise<IssuerMembership[]> {
    return Promise.resolve(
      [...this.members.values()].filter((m) => m.organisationId === organisationId),
    );
  }

  membershipsFor(userId: string): Promise<IssuerMembership[]> {
    return Promise.resolve([...this.members.values()].filter((m) => m.userId === userId));
  }
}
