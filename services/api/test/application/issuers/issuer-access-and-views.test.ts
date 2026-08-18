import { beforeEach, describe, expect, it } from "vitest";
import { IssuerTeamAccess } from "../../../src/application/issuers/issuer-team-access.js";
import {
  GetIssuer,
  ListIssuerTeam,
  ListIssuers,
  ListMyIssuerOrganisations,
} from "../../../src/application/issuers/issuer-views.js";
import {
  IssuerOrganisationNotFoundError,
  NotIssuerAdminError,
  NotIssuerTeamMemberError,
} from "../../../src/application/issuers/errors.js";
import { IssuerMembership } from "../../../src/domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../../src/domain/issuers/issuer-organisation.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { StaffUser } from "../../../src/domain/identity/staff-user.js";
import { InMemoryIssuerRepository } from "../../fakes/issuer-fakes.js";
import { InMemoryStaffUserRepository } from "../../fakes/identity-fakes.js";

const APPLIED_AT = new Date("2026-08-01T09:00:00Z");
const DECIDED_AT = new Date("2026-08-02T09:00:00Z");

const emails = new Map([
  ["user-founder", "founder@vanak.example"],
  ["user-colleague", "colleague@vanak.example"],
]);
const directory = {
  findIdByEmail: (email: string) =>
    Promise.resolve([...emails].find(([, address]) => address === email.toLowerCase())?.[0]),
  emailOf: (userId: string) => Promise.resolve(emails.get(userId)),
};

let issuers: InMemoryIssuerRepository;
let staff: InMemoryStaffUserRepository;

const officer = (id: string, email: string) =>
  StaffUser.create(id, EmailAddress.of(email), PasswordHash.of("x"), ["compliance_analyst"]);

const organisation = (id: string) =>
  IssuerOrganisation.apply({
    id,
    legalName: `Holdings ${id}`,
    registrationNumber: `IR-${id}`,
    contactEmail: `ops-${id}@vanak.example`,
    appliedAt: APPLIED_AT,
  });

const member = (
  organisationId: string,
  userId: string,
  role: "issuer_admin" | "issuer_contributor",
) => IssuerMembership.of({ organisationId, userId, role, addedAt: APPLIED_AT });

beforeEach(async () => {
  issuers = new InMemoryIssuerRepository();
  staff = new InMemoryStaffUserRepository();
  await staff.save(officer("officer-1", "compliance@platform.local"));
  await issuers.save(organisation("org-1"));
  await issuers.addMember(member("org-1", "user-founder", "issuer_admin"));
  await issuers.addMember(member("org-1", "user-colleague", "issuer_contributor"));
});

describe("ListIssuers", () => {
  it("shows an officer what they must decide about", async () => {
    const [view] = await new ListIssuers(issuers, staff).execute();

    expect(view?.legalName).toBe("Holdings org-1");
    expect(view?.registrationNumber).toBe("IR-org-1");
    expect(view?.state).toBe("applied");
    expect(view?.appliedAt).toBe(APPLIED_AT.toISOString());
    // Nothing has been decided, so there is no decision to report — an empty
    // string here would read as "decided by nobody".
    expect(view?.decidedAt).toBeUndefined();
    expect(view?.decidedBy).toBeUndefined();
    expect(view?.canSubmitAssets).toBe(false);
  });

  it("carries the decision and the reason once one has been taken", async () => {
    await issuers.save(
      organisation("org-2")
        .startReview(DECIDED_AT)
        .reject(DECIDED_AT, "officer-1", "registration number does not match the registry"),
    );

    const rejected = (await new ListIssuers(issuers, staff).execute()).find(
      (v) => v.id === "org-2",
    );

    expect(rejected?.state).toBe("rejected");
    expect(rejected?.decidedAt).toBe(DECIDED_AT.toISOString());
    expect(rejected?.decidedBy).toBe("officer-1");
    expect(rejected?.rejectionReason).toBe("registration number does not match the registry");
  });

  // A decision is taken by a PERSON, and "officer-1" names nobody. The id stays
  // for the audit trail; the label is what a reader is shown.
  it("names the officer who decided, not their account id", async () => {
    await issuers.save(
      organisation("org-2").startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"),
    );

    const approved = (await new ListIssuers(issuers, staff).execute()).find(
      (v) => v.id === "org-2",
    );

    expect(approved?.decidedBy).toBe("officer-1");
    expect(approved?.decidedByLabel).toBe("compliance@platform.local");
  });

  it("falls back to the id when the account cannot be resolved", async () => {
    // A decision must never lose its author because the account was renamed,
    // disabled or removed — showing the id beats showing nothing.
    await issuers.save(
      organisation("org-2").startReview(DECIDED_AT).approve(DECIDED_AT, "officer-long-gone"),
    );

    const approved = (await new ListIssuers(issuers, staff).execute()).find(
      (v) => v.id === "org-2",
    );

    expect(approved?.decidedBy).toBe("officer-long-gone");
    expect(approved?.decidedByLabel).toBeUndefined();
  });

  it("looks each officer up once, however many rows they decided", async () => {
    // The queue is read often; a lookup per row would multiply with the backlog.
    for (const id of ["org-2", "org-3", "org-4"]) {
      await issuers.save(organisation(id).startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"));
    }
    staff.lookups = 0;

    await new ListIssuers(issuers, staff).execute();

    expect(staff.lookups).toBe(1);
  });

  it("asks for nothing when no application has been decided", async () => {
    staff.lookups = 0;

    await new ListIssuers(issuers, staff).execute();

    expect(staff.lookups).toBe(0);
  });
});

describe("GetIssuer", () => {
  it("gives one organisation, named the same way the queue names it", async () => {
    await issuers.save(
      organisation("org-2").startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"),
    );

    const view = await new GetIssuer(issuers, staff).execute({ organisationId: "org-2" });

    expect(view.legalName).toBe("Holdings org-2");
    expect(view.state).toBe("approved");
    expect(view.canSubmitAssets).toBe(true);
    expect(view.decidedByLabel).toBe("compliance@platform.local");
  });

  it("refuses an organisation that does not exist", async () => {
    await expect(
      new GetIssuer(issuers, staff).execute({ organisationId: "ghost" }),
    ).rejects.toThrow(IssuerOrganisationNotFoundError);
  });
});

describe("ListIssuerTeam", () => {
  it("names the people by address, not by identifier", async () => {
    // A screen listing UUIDs tells an officer nothing about who these people
    // are.
    const team = await new ListIssuerTeam(issuers, directory).execute({ organisationId: "org-1" });

    expect(team.map((m) => m.email).sort()).toEqual([
      "colleague@vanak.example",
      "founder@vanak.example",
    ]);
    expect(team.find((m) => m.userId === "user-founder")?.canManageTeam).toBe(true);
    expect(team.find((m) => m.userId === "user-colleague")?.canManageTeam).toBe(false);
  });

  it("still lists a person whose address cannot be resolved", async () => {
    // Losing the whole team because one lookup failed would be worse than
    // showing that one row without an address.
    await issuers.addMember(member("org-1", "user-ghost", "issuer_contributor"));

    const team = await new ListIssuerTeam(issuers, directory).execute({ organisationId: "org-1" });

    expect(team).toHaveLength(3);
    expect(team.find((m) => m.userId === "user-ghost")?.email).toBeUndefined();
  });

  it("refuses to list the team of an organisation that does not exist", async () => {
    await expect(
      new ListIssuerTeam(issuers, directory).execute({ organisationId: "ghost" }),
    ).rejects.toThrow();
  });
});

describe("IssuerTeamAccess", () => {
  let access: IssuerTeamAccess;

  beforeEach(() => {
    access = new IssuerTeamAccess(issuers);
  });

  it("lets a member see their own organisation's team", async () => {
    await expect(
      access.assertMember({ organisationId: "org-1", userId: "user-colleague" }),
    ).resolves.toBeUndefined();
  });

  it("keeps a stranger out of a team they have nothing to do with", async () => {
    await expect(
      access.assertMember({ organisationId: "org-1", userId: "user-stranger" }),
    ).rejects.toThrow(NotIssuerTeamMemberError);
  });

  // Same rule as LastIssuerAdminError: the reader is the person being refused,
  // so naming them by their own account UUID tells them nothing they could act
  // on. This refusal is read in the issuer portal, where it is the whole page.
  it("refuses without reciting the reader's account id back at them", () => {
    const message = new NotIssuerTeamMemberError().message;

    expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(message.toLowerCase()).toContain("do not act for");
  });

  it("lets an administrator staff the team", async () => {
    await expect(
      access.assertCanManageTeam({ organisationId: "org-1", userId: "user-founder" }),
    ).resolves.toBeUndefined();
  });

  it("stops a contributor from staffing the team", async () => {
    // The split that makes the two roles worth having: preparing an asset is
    // not the same privilege as deciding who else gets in.
    await expect(
      access.assertCanManageTeam({ organisationId: "org-1", userId: "user-colleague" }),
    ).rejects.toThrow(NotIssuerAdminError);
  });

  it("does not let membership of one organisation carry into another", async () => {
    await issuers.save(organisation("org-2"));

    await expect(
      access.assertCanManageTeam({ organisationId: "org-2", userId: "user-founder" }),
    ).rejects.toThrow(NotIssuerTeamMemberError);
  });
});

// 3.3d: the spine of the issuer portal. Before a person can be shown anything
// about "their" organisation, the platform has to answer which organisations
// are theirs, and what their role there lets them do.
describe("ListMyIssuerOrganisations", () => {
  it("returns only the organisations the person actually belongs to", async () => {
    await issuers.save(organisation("org-2"));
    await issuers.addMember(member("org-2", "user-stranger", "issuer_admin"));

    const mine = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-founder",
    });

    expect(mine.map((row) => row.id)).toEqual(["org-1"]);
  });

  it("carries the role and what it lets this person do", async () => {
    const [asAdmin] = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-founder",
    });
    const [asContributor] = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-colleague",
    });

    expect(asAdmin?.role).toBe("issuer_admin");
    expect(asAdmin?.canManageTeam).toBe(true);
    expect(asContributor?.role).toBe("issuer_contributor");
    // A contributor prepares assets but does not staff the organisation.
    expect(asContributor?.canManageTeam).toBe(false);
    expect(asContributor?.canWorkOnAssets).toBe(true);
  });

  it("still describes the organisation itself, exactly as every other reader sees it", async () => {
    const [view] = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-founder",
    });

    expect(view?.legalName).toBe("Holdings org-1");
    expect(view?.state).toBe("applied");
    // Not approved yet, so this organisation may not submit assets — the
    // portal must be able to say so rather than offering a dead action.
    expect(view?.canSubmitAssets).toBe(false);
  });

  it("returns nothing for a person with no issuer membership at all", async () => {
    const mine = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-nobody",
    });

    expect(mine).toEqual([]);
  });

  it("skips a membership whose organisation has vanished, rather than failing the whole list", async () => {
    await issuers.addMember(member("org-deleted", "user-founder", "issuer_admin"));

    const mine = await new ListMyIssuerOrganisations(issuers, staff).execute({
      userId: "user-founder",
    });

    // One bad row must not cost this person the organisation they do have.
    expect(mine.map((row) => row.id)).toEqual(["org-1"]);
  });
});
