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

// An organisation as one of its OWN people sees it: the same facts every other
// reader gets, plus the two questions the portal must answer before it renders
// anything — what is my role here, and what does it let me do?
export interface MyIssuerOrganisationView extends IssuerOrganisationView {
  role: IssuerRole;
  canManageTeam: boolean;
  canWorkOnAssets: boolean;
}

export interface IssuerMemberView {
  userId: string;
  email?: string;
  role: IssuerRole;
  addedAt: string;
  canManageTeam: boolean;
}

// One definition of "an organisation as a reader sees it", so the queue and a
// single organisation can never drift apart.
const toIssuerView = (
  organisation: IssuerOrganisation,
  labels: ReadonlyMap<string, string>,
): IssuerOrganisationView => ({
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
});

const labelOf = (
  labels: ReadonlyMap<string, string>,
  organisation: IssuerOrganisation,
): { decidedByLabel?: string } => {
  const label =
    organisation.decidedBy === undefined ? undefined : labels.get(organisation.decidedBy);
  return label === undefined ? {} : { decidedByLabel: label };
};

// One lookup per distinct officer, not per row — the queue is read often and
// one officer decides many applications. An unresolved account keeps its id.
const staffLabelsFor = async (
  staff: StaffUserRepository,
  rows: readonly IssuerOrganisation[],
): Promise<ReadonlyMap<string, string>> => {
  const ids = new Set(
    rows.map((row) => row.decidedBy).filter((id): id is string => id !== undefined),
  );
  const labels = new Map<string, string>();
  for (const id of ids) {
    const email = (await staff.findById(id))?.email.value;
    if (email !== undefined) {
      labels.set(id, email);
    }
  }
  return labels;
};

export class ListIssuers {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async execute(): Promise<IssuerOrganisationView[]> {
    const rows = await this.issuers.findAll();
    const labels = await staffLabelsFor(this.staff, rows);
    return rows.map((organisation) => toIssuerView(organisation, labels));
  }
}

// One organisation, for its own page. Unknown ids are refused rather than
// returning an empty shell a screen would render as a real record.
export class GetIssuer {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async execute(input: { organisationId: string }): Promise<IssuerOrganisationView> {
    const organisation = await loadIssuer(this.issuers, input.organisationId);
    return toIssuerView(organisation, await staffLabelsFor(this.staff, [organisation]));
  }
}

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

// The spine of the issuer portal: which organisations are this person's, and
// what may they do in each. Staff read `ListIssuers`; a person acting for an
// issuer reads this, and never sees an organisation they are not part of.
export class ListMyIssuerOrganisations {
  constructor(
    private readonly issuers: IssuerRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async execute(input: { userId: string }): Promise<MyIssuerOrganisationView[]> {
    const memberships = await this.issuers.membershipsFor(input.userId);
    const found = await Promise.all(
      memberships.map(async (membership) => {
        const organisation = await this.issuers.findById(membership.organisationId);
        // A membership pointing at an organisation that is gone is a broken
        // row, not a reason to deny this person the organisations they do
        // have. It is skipped, never rendered as an empty shell.
        return organisation === undefined ? undefined : { membership, organisation };
      }),
    );
    const rows = found.filter((row): row is NonNullable<typeof row> => row !== undefined);
    const labels = await staffLabelsFor(
      this.staff,
      rows.map((row) => row.organisation),
    );
    return rows.map(({ membership, organisation }) => ({
      ...toIssuerView(organisation, labels),
      role: membership.role,
      canManageTeam: membership.canManageTeam(),
      canWorkOnAssets: membership.canWorkOnAssets(),
    }));
  }
}
