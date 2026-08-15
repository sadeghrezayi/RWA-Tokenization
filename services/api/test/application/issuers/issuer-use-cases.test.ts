import { beforeEach, describe, expect, it } from "vitest";
import { AddTeamMember } from "../../../src/application/issuers/add-team-member.js";
import { ApplyAsIssuer } from "../../../src/application/issuers/apply-as-issuer.js";
import { DecideIssuerApplication } from "../../../src/application/issuers/decide-issuer-application.js";
import { PersonNotVerifiedError } from "../../../src/application/issuers/errors.js";
import { InMemoryIssuerRepository } from "../../fakes/issuer-fakes.js";

const NOW = new Date("2026-08-15T10:00:00Z");
const clock = { now: () => NOW };
const ids = (() => {
  let n = 0;
  return {
    nextId: () => {
      n += 1;
      return `org-${String(n)}`;
    },
  };
})();

// Who counts as individually verified. Kept as a port because an issuer's
// people are Users while individual KYC lives on the Investor record — the
// adapter has real work behind it, and the use case must not care.
const verified = new Set<string>();
const verification = {
  isVerified: (userId: string) => Promise.resolve(verified.has(userId)),
};

let issuers: InMemoryIssuerRepository;
let apply: ApplyAsIssuer;
let decide: DecideIssuerApplication;
let addMember: AddTeamMember;

beforeEach(() => {
  issuers = new InMemoryIssuerRepository();
  verified.clear();
  apply = new ApplyAsIssuer(issuers, ids, clock);
  decide = new DecideIssuerApplication(issuers, clock);
  addMember = new AddTeamMember(issuers, verification, clock);
});

const applied = async () =>
  (
    await apply.execute({
      legalName: "Vanak Property Holdings PJSC",
      registrationNumber: "IR-448120",
      contactEmail: "ops@vanak.example",
    })
  ).organisationId;

describe("ApplyAsIssuer", () => {
  it("files an application that can do nothing yet", async () => {
    const id = await applied();

    const organisation = await issuers.findById(id);
    expect(organisation?.state).toBe("applied");
    expect(organisation?.canSubmitAssets()).toBe(false);
  });
});

describe("DecideIssuerApplication", () => {
  it("approves an application and names who decided", async () => {
    const id = await applied();

    await decide.startReview({ organisationId: id });
    await decide.approve({ organisationId: id, officerId: "officer-1" });

    const organisation = await issuers.findById(id);
    expect(organisation?.state).toBe("approved");
    expect(organisation?.decidedBy).toBe("officer-1");
  });

  it("rejects with the reason the officer gave", async () => {
    const id = await applied();

    await decide.startReview({ organisationId: id });
    await decide.reject({
      organisationId: id,
      officerId: "officer-1",
      reason: "registration number does not match the registry",
    });

    expect((await issuers.findById(id))?.rejectionReason).toBe(
      "registration number does not match the registry",
    );
  });

  it("refuses to decide an organisation that does not exist", async () => {
    await expect(decide.startReview({ organisationId: "ghost" })).rejects.toThrow();
  });
});

describe("AddTeamMember", () => {
  // The user's decision: verifying the company is not enough — each person
  // acting for it must be individually verified too.
  it("refuses someone who has not been individually verified", async () => {
    const id = await applied();

    await expect(
      addMember.execute({ organisationId: id, userId: "user-1", role: "issuer_admin" }),
    ).rejects.toThrow(PersonNotVerifiedError);

    expect(await issuers.membersOf(id)).toEqual([]);
  });

  it("adds a verified person in the role given", async () => {
    const id = await applied();
    verified.add("user-1");

    await addMember.execute({ organisationId: id, userId: "user-1", role: "issuer_admin" });

    const members = await issuers.membersOf(id);
    expect(members).toHaveLength(1);
    expect(members[0]?.canManageTeam()).toBe(true);
  });

  it("changes an existing member's role rather than adding them twice", async () => {
    const id = await applied();
    verified.add("user-1");

    await addMember.execute({ organisationId: id, userId: "user-1", role: "issuer_contributor" });
    await addMember.execute({ organisationId: id, userId: "user-1", role: "issuer_admin" });

    const members = await issuers.membersOf(id);
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("issuer_admin");
  });

  it("refuses to staff an organisation that does not exist", async () => {
    verified.add("user-1");

    await expect(
      addMember.execute({ organisationId: "ghost", userId: "user-1", role: "issuer_admin" }),
    ).rejects.toThrow();
  });
});
