import { LastIssuerAdminError } from "./errors.js";
import { loadIssuer } from "./load-issuer.js";
import type { IssuerRepository } from "./ports.js";

// The counterpart of inviting a colleague: a person who leaves the company must
// stop acting for the issuer. Without this, granting is permanent.
//
// One rule guards it — an organisation must keep at least one administrator.
// Remove the last one and nobody could ever staff it again except the platform,
// which is the dependency having admins exists to avoid.
export class RemoveTeamMember {
  constructor(private readonly issuers: IssuerRepository) {}

  async execute(input: { organisationId: string; userId: string }): Promise<void> {
    await loadIssuer(this.issuers, input.organisationId);
    const members = await this.issuers.membersOf(input.organisationId);
    const going = members.find((member) => member.userId === input.userId);
    if (!going) {
      // Already gone: the caller's intent is satisfied.
      return;
    }
    const otherAdmins = members.filter(
      (member) => member.userId !== input.userId && member.canManageTeam(),
    );
    if (going.canManageTeam() && otherAdmins.length === 0) {
      throw new LastIssuerAdminError();
    }
    await this.issuers.removeMember(input.organisationId, input.userId);
  }
}
