import { beforeEach, describe, expect, it } from "vitest";
import { IssuerTeamAccess } from "../../../src/application/issuers/issuer-team-access.js";
import { ListIssuerTeam, ListIssuers } from "../../../src/application/issuers/issuer-views.js";
import {
  NotIssuerAdminError,
  NotIssuerTeamMemberError,
} from "../../../src/application/issuers/errors.js";
import { IssuerMembership } from "../../../src/domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../../src/domain/issuers/issuer-organisation.js";
import { InMemoryIssuerRepository } from "../../fakes/issuer-fakes.js";

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
  await issuers.save(organisation("org-1"));
  await issuers.addMember(member("org-1", "user-founder", "issuer_admin"));
  await issuers.addMember(member("org-1", "user-colleague", "issuer_contributor"));
});

describe("ListIssuers", () => {
  it("shows an officer what they must decide about", async () => {
    const [view] = await new ListIssuers(issuers).execute();

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

    const rejected = (await new ListIssuers(issuers).execute()).find((v) => v.id === "org-2");

    expect(rejected?.state).toBe("rejected");
    expect(rejected?.decidedAt).toBe(DECIDED_AT.toISOString());
    expect(rejected?.decidedBy).toBe("officer-1");
    expect(rejected?.rejectionReason).toBe("registration number does not match the registry");
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
