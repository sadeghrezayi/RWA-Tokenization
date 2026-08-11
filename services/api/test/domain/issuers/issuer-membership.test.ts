import { describe, expect, it } from "vitest";
import { ISSUER_ROLES, IssuerMembership } from "../../../src/domain/issuers/issuer-membership.js";
import { InvalidIssuerMembershipError } from "../../../src/domain/issuers/errors.js";

const member = (role: (typeof ISSUER_ROLES)[number] = "issuer_admin") =>
  IssuerMembership.of({
    organisationId: "org-1",
    userId: "user-1",
    role,
    addedAt: new Date("2026-08-01T09:00:00Z"),
  });

// 3.2: a person acting for an organisation. Membership is what ties a login to
// an issuer — without one, a user has no issuer powers at all.
describe("IssuerMembership", () => {
  it("ties a person to one organisation in one role", () => {
    const membership = member();

    expect(membership.organisationId).toBe("org-1");
    expect(membership.userId).toBe("user-1");
    expect(membership.role).toBe("issuer_admin");
  });

  it("lets an admin manage the team, and a contributor not", () => {
    // The split exists so that submitting a property and inviting colleagues
    // are not the same privilege.
    expect(member("issuer_admin").canManageTeam()).toBe(true);
    expect(member("issuer_contributor").canManageTeam()).toBe(false);
  });

  it("lets both roles work on the organisation's assets", () => {
    expect(member("issuer_admin").canWorkOnAssets()).toBe(true);
    expect(member("issuer_contributor").canWorkOnAssets()).toBe(true);
  });

  it("refuses a role it does not know", () => {
    expect(() =>
      IssuerMembership.of({
        organisationId: "org-1",
        userId: "user-1",
        role: "owner" as (typeof ISSUER_ROLES)[number],
        addedAt: new Date(),
      }),
    ).toThrow(InvalidIssuerMembershipError);
  });

  it("refuses a membership with no organisation or no person", () => {
    expect(() =>
      IssuerMembership.of({
        organisationId: "  ",
        userId: "user-1",
        role: "issuer_admin",
        addedAt: new Date(),
      }),
    ).toThrow(InvalidIssuerMembershipError);

    expect(() =>
      IssuerMembership.of({
        organisationId: "org-1",
        userId: "  ",
        role: "issuer_admin",
        addedAt: new Date(),
      }),
    ).toThrow(InvalidIssuerMembershipError);
  });
});
