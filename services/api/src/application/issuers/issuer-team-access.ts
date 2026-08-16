import { NotIssuerAdminError, NotIssuerTeamMemberError } from "./errors.js";
import type { IssuerRepository } from "./ports.js";

// Resource-level authorization for issuer people.
//
// The platform's RBAC answers "may this role manage issuers at all"; it cannot
// answer "is this person one of THIS organisation's people", which is
// membership. Both questions are asked — staff by permission, an issuer's own
// people by membership — and this is the second one.
export class IssuerTeamAccess {
  constructor(private readonly issuers: IssuerRepository) {}

  async assertMember(input: { organisationId: string; userId: string }): Promise<void> {
    await this.membershipIn(input);
  }

  async assertCanManageTeam(input: { organisationId: string; userId: string }): Promise<void> {
    const membership = await this.membershipIn(input);
    if (!membership.canManageTeam()) {
      throw new NotIssuerAdminError(input.userId, input.organisationId);
    }
  }

  private async membershipIn(input: { organisationId: string; userId: string }) {
    const memberships = await this.issuers.membershipsFor(input.userId);
    // Membership never carries across organisations: an admin of one issuer is
    // a stranger to every other.
    const membership = memberships.find((m) => m.organisationId === input.organisationId);
    if (!membership) {
      throw new NotIssuerTeamMemberError(input.userId, input.organisationId);
    }
    return membership;
  }
}
