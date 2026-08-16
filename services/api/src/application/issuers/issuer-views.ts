import type { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";
import type { IssuerOrganisationState } from "../../domain/issuers/issuer-organisation.js";
import type { IssuerRole } from "../../domain/issuers/issuer-membership.js";
import type { StaffUserRepository } from "../identity/ports.js";
import { loadIssuer } from "./load-issuer.js";
import type { IssuerRepository, PersonDirectory } from "./ports.js";

// What an officer needs in front of them to decide an application, and what an
// issuer's people need to see about their own organisation. Dates leave as ISO
// strings; absent facts stay absent rather than becoming empty strings, so
// "not decided yet" never reads as "decided by nobody".
export interface IssuerOrganisationView {
  id: string;
  legalName: string;
  registrationNumber: string;
  contactEmail: string;
  state: IssuerOrganisationState;
  appliedAt: string;
  decidedAt?: string;
  // The account id, kept because it is the stable thing an audit refers to, and
  // the human label a reader is actually shown. An id that cannot be resolved
  // simply has no label — the decision never loses its author.
  decidedBy?: string;
  decidedByLabel?: string;
  rejectionReason?: string;
  canSubmitAssets: boolean;
}

export interface IssuerMemberView {
  userId: string;
  email?: string;
  role: IssuerRole;
  addedAt: string;
  canManageTeam: boolean;
}

export class ListIssuers {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async execute(): Promise<IssuerOrganisationView[]> {
    const rows = await this.issuers.findAll();
    const labels = await this.labelsFor(rows);
    return rows.map((organisation) => ({
      id: organisation.id,
      legalName: organisation.legalName,
      registrationNumber: organisation.registrationNumber,
      contactEmail: organisation.contactEmail,
      state: organisation.state,
      appliedAt: organisation.appliedAt.toISOString(),
      ...(organisation.decidedAt ? { decidedAt: organisation.decidedAt.toISOString() } : {}),
      ...(organisation.decidedBy ? { decidedBy: organisation.decidedBy } : {}),
      ...labelOf(labels, organisation),
      ...(organisation.rejectionReason ? { rejectionReason: organisation.rejectionReason } : {}),
      canSubmitAssets: organisation.canSubmitAssets(),
    }));
  }

  // One lookup per distinct officer in the batch, not per row — the queue is
  // read often and one officer decides many applications.
  private async labelsFor(
    rows: readonly IssuerOrganisation[],
  ): Promise<ReadonlyMap<string, string>> {
    const ids = new Set(
      rows.map((row) => row.decidedBy).filter((id): id is string => id !== undefined),
    );
    const labels = new Map<string, string>();
    for (const id of ids) {
      const email = (await this.staff.findById(id))?.email.value;
      if (email !== undefined) {
        labels.set(id, email);
      }
    }
    return labels;
  }
}

const labelOf = (
  labels: ReadonlyMap<string, string>,
  organisation: IssuerOrganisation,
): { decidedByLabel?: string } => {
  const label =
    organisation.decidedBy === undefined ? undefined : labels.get(organisation.decidedBy);
  return label === undefined ? {} : { decidedByLabel: label };
};

export class ListIssuerTeam {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly people: PersonDirectory,
  ) {}

  async execute(input: { organisationId: string }): Promise<IssuerMemberView[]> {
    await loadIssuer(this.issuers, input.organisationId);
    const members = await this.issuers.membersOf(input.organisationId);
    return Promise.all(
      members.map(async (member) => {
        // A row whose address cannot be resolved is still a person acting for
        // this issuer — showing it without an address beats hiding the team.
        const email = await this.people.emailOf(member.userId);
        return {
          userId: member.userId,
          ...(email !== undefined ? { email } : {}),
          role: member.role,
          addedAt: member.addedAt.toISOString(),
          canManageTeam: member.canManageTeam(),
        };
      }),
    );
  }
}
