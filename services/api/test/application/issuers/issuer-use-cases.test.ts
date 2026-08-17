import { beforeEach, describe, expect, it } from "vitest";
import { AddTeamMember } from "../../../src/application/issuers/add-team-member.js";
import { ApplyAsIssuer } from "../../../src/application/issuers/apply-as-issuer.js";
import { DecideIssuerApplication } from "../../../src/application/issuers/decide-issuer-application.js";
import { RemoveTeamMember } from "../../../src/application/issuers/remove-team-member.js";
import {
  LastIssuerAdminError,
  PersonNotFoundError,
  PersonNotVerifiedError,
} from "../../../src/application/issuers/errors.js";
import type { IssuerRole } from "../../../src/domain/issuers/issuer-membership.js";
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

// People are known to each other by email, never by UUID. Matching is on the
// normalized address, as the real directory does through EmailAddress.
const people = new Map<string, string>();
const directory = {
  findIdByEmail: (email: string) => Promise.resolve(people.get(email.trim().toLowerCase())),
  emailOf: (userId: string) => Promise.resolve([...people].find(([, id]) => id === userId)?.[0]),
};

let issuers: InMemoryIssuerRepository;
let apply: ApplyAsIssuer;
let decide: DecideIssuerApplication;
let addMember: AddTeamMember;
let removeMember: RemoveTeamMember;

beforeEach(() => {
  issuers = new InMemoryIssuerRepository();
  verified.clear();
  people.clear();
  people.set("founder@vanak.example", "user-founder");
  people.set("colleague@vanak.example", "user-colleague");
  verified.add("user-founder");
  apply = new ApplyAsIssuer(issuers, verification, ids, clock);
  decide = new DecideIssuerApplication(issuers, clock);
  addMember = new AddTeamMember(issuers, directory, verification, clock);
  removeMember = new RemoveTeamMember(issuers);
});

const applied = async (applicantUserId = "user-founder") =>
  (
    await apply.execute({
      applicantUserId,
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

  // The person who applies is the first person acting for the organisation, so
  // they are its administrator. Otherwise an approved issuer would have nobody
  // able to staff it but the platform.
  it("makes the applicant the organisation's administrator", async () => {
    const id = await applied();

    const members = await issuers.membersOf(id);
    expect(members).toHaveLength(1);
    expect(members[0]?.userId).toBe("user-founder");
    expect(members[0]?.canManageTeam()).toBe(true);
  });

  it("refuses an applicant who has not been individually verified", async () => {
    // The company is verified by the platform's review; the person applying for
    // it is not exempt from verifying themselves.
    await expect(applied("user-colleague")).rejects.toThrow(PersonNotVerifiedError);

    expect(await issuers.findAll()).toEqual([]);
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
      addMember.execute({
        organisationId: id,
        email: "colleague@vanak.example",
        role: "issuer_contributor",
      }),
    ).rejects.toThrow(PersonNotVerifiedError);

    expect(await issuers.membersOf(id)).toHaveLength(1);
  });

  // The inviter typed an address; telling them a UUID is not verified names
  // nobody they know. The refusal has to be readable by the person who caused it.
  it("refuses by the address the inviter typed, not by an internal id", async () => {
    const id = await applied();

    await expect(
      addMember.execute({
        organisationId: id,
        email: "colleague@vanak.example",
        role: "issuer_contributor",
      }),
    ).rejects.toThrow(/colleague@vanak\.example/);
  });

  it("adds a verified person in the role given", async () => {
    const id = await applied();
    verified.add("user-colleague");

    await addMember.execute({
      organisationId: id,
      email: "colleague@vanak.example",
      role: "issuer_contributor",
    });

    const added = (await issuers.membersOf(id)).find((m) => m.userId === "user-colleague");
    expect(added?.role).toBe("issuer_contributor");
    expect(added?.canManageTeam()).toBe(false);
  });

  it("finds the person however their address was typed", async () => {
    const id = await applied();
    verified.add("user-colleague");

    await addMember.execute({
      organisationId: id,
      email: "  Colleague@Vanak.example  ",
      role: "issuer_contributor",
    });

    expect((await issuers.membersOf(id)).map((m) => m.userId)).toContain("user-colleague");
  });

  it("changes an existing member's role rather than adding them twice", async () => {
    const id = await applied();
    verified.add("user-colleague");

    await addMember.execute({
      organisationId: id,
      email: "colleague@vanak.example",
      role: "issuer_contributor",
    });
    await addMember.execute({
      organisationId: id,
      email: "colleague@vanak.example",
      role: "issuer_admin",
    });

    const members = await issuers.membersOf(id);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === "user-colleague")?.role).toBe("issuer_admin");
  });

  it("says plainly when nobody on the platform has that address", async () => {
    // An admin inviting a colleague who has not registered needs to be told
    // that, not handed a silent failure or a blank 500.
    const id = await applied();

    await expect(
      addMember.execute({
        organisationId: id,
        email: "stranger@elsewhere.example",
        role: "issuer_contributor",
      }),
    ).rejects.toThrow(PersonNotFoundError);
  });

  it("refuses to staff an organisation that does not exist", async () => {
    verified.add("user-colleague");

    await expect(
      addMember.execute({
        organisationId: "ghost",
        email: "colleague@vanak.example",
        role: "issuer_admin",
      }),
    ).rejects.toThrow();
  });
});

describe("RemoveTeamMember", () => {
  const invite = async (organisationId: string, role: IssuerRole = "issuer_contributor") => {
    verified.add("user-colleague");
    await addMember.execute({ organisationId, email: "colleague@vanak.example", role });
  };

  it("takes someone off the team when they leave the company", async () => {
    // Granting without revoking would leave a departed colleague acting for the
    // issuer forever.
    const id = await applied();
    await invite(id);

    await removeMember.execute({ organisationId: id, userId: "user-colleague" });

    expect((await issuers.membersOf(id)).map((m) => m.userId)).toEqual(["user-founder"]);
  });

  it("refuses to remove the last administrator", async () => {
    // An organisation with no admin can never staff itself again — only the
    // platform could, which is exactly the dependency admins exist to avoid.
    const id = await applied();
    await invite(id);

    await expect(
      removeMember.execute({ organisationId: id, userId: "user-founder" }),
    ).rejects.toThrow(LastIssuerAdminError);

    expect(await issuers.membersOf(id)).toHaveLength(2);
  });

  it("says why without reciting an identifier the reader already has", async () => {
    // The refusal is read on the organisation's own page. Printing its UUID
    // adds noise, not information.
    const id = await applied();
    await invite(id);

    await expect(
      removeMember.execute({ organisationId: id, userId: "user-founder" }),
    ).rejects.toThrow(/^this organisation must keep at least one administrator$/i);
  });

  it("removes an administrator once another one remains", async () => {
    const id = await applied();
    await invite(id, "issuer_admin");

    await removeMember.execute({ organisationId: id, userId: "user-founder" });

    expect((await issuers.membersOf(id)).map((m) => m.userId)).toEqual(["user-colleague"]);
  });

  it("is content when the person is already gone", async () => {
    const id = await applied();

    await expect(
      removeMember.execute({ organisationId: id, userId: "user-nobody" }),
    ).resolves.toBeUndefined();
  });

  it("refuses to touch an organisation that does not exist", async () => {
    await expect(
      removeMember.execute({ organisationId: "ghost", userId: "user-colleague" }),
    ).rejects.toThrow();
  });
});
