import { beforeEach, describe, expect, it } from "vitest";
import { IssuerMembership } from "../../src/domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../src/domain/issuers/issuer-organisation.js";
import type { IssuerRepository } from "../../src/application/issuers/ports.js";

const APPLIED_AT = new Date("2026-08-01T09:00:00Z");
const DECIDED_AT = new Date("2026-08-02T09:00:00Z");

const applicant = (id: string) =>
  IssuerOrganisation.apply({
    id,
    legalName: "Vanak Property Holdings PJSC",
    registrationNumber: "IR-448120",
    contactEmail: "ops@vanakholdings.example",
    appliedAt: APPLIED_AT,
  });

// LSP contract: every IssuerRepository implementation must pass unchanged.
export const issuerRepositoryContract = (
  name: string,
  makeRepo: () => Promise<IssuerRepository>,
): void => {
  describe(`IssuerRepository contract — ${name}`, () => {
    let repo: IssuerRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns undefined for an unknown organisation", async () => {
      expect(await repo.findById("nobody")).toBeUndefined();
    });

    it("round trips an application verbatim", async () => {
      await repo.save(applicant("org-applied"));

      const loaded = await repo.findById("org-applied");

      expect(loaded?.legalName).toBe("Vanak Property Holdings PJSC");
      expect(loaded?.registrationNumber).toBe("IR-448120");
      expect(loaded?.contactEmail).toBe("ops@vanakholdings.example");
      expect(loaded?.state).toBe("applied");
      expect(loaded?.canSubmitAssets()).toBe(false);
    });

    it("remembers who approved an organisation, and when", async () => {
      // An approval nobody is named on is not auditable.
      await repo.save(applicant("org-approved").startReview(DECIDED_AT).approve(DECIDED_AT, "officer-1"));

      const loaded = await repo.findById("org-approved");

      expect(loaded?.state).toBe("approved");
      expect(loaded?.decidedBy).toBe("officer-1");
      expect(loaded?.decidedAt?.toISOString()).toBe(DECIDED_AT.toISOString());
      expect(loaded?.canSubmitAssets()).toBe(true);
    });

    it("keeps the reason a rejection was given", async () => {
      await repo.save(
        applicant("org-rejected")
          .startReview(DECIDED_AT)
          .reject(DECIDED_AT, "officer-1", "registration number does not match the registry"),
      );

      const loaded = await repo.findById("org-rejected");

      expect(loaded?.state).toBe("rejected");
      expect(loaded?.rejectionReason).toBe("registration number does not match the registry");
    });

    it("overwrites an organisation on re-save rather than duplicating it", async () => {
      await repo.save(applicant("org-1"));
      await repo.save(applicant("org-1").startReview(DECIDED_AT));

      expect((await repo.findById("org-1"))?.state).toBe("in_review");
      expect(await repo.findAll()).toHaveLength(1);
    });

    it("records who acts for an organisation, in which role", async () => {
      await repo.save(applicant("org-1"));
      await repo.addMember(
        IssuerMembership.of({
          organisationId: "org-1",
          userId: "user-1",
          role: "issuer_admin",
          addedAt: APPLIED_AT,
        }),
      );

      const members = await repo.membersOf("org-1");

      expect(members).toHaveLength(1);
      expect(members[0]?.userId).toBe("user-1");
      expect(members[0]?.canManageTeam()).toBe(true);
    });

    it("answers which organisations a person acts for", async () => {
      // The question asked on every issuer request.
      await repo.save(applicant("org-1"));
      await repo.save(applicant("org-2"));
      for (const organisationId of ["org-1", "org-2"]) {
        await repo.addMember(
          IssuerMembership.of({
            organisationId,
            userId: "user-1",
            role: "issuer_contributor",
            addedAt: APPLIED_AT,
          }),
        );
      }

      expect((await repo.membershipsFor("user-1")).map((m) => m.organisationId).sort()).toEqual([
        "org-1",
        "org-2",
      ]);
      expect(await repo.membershipsFor("user-2")).toEqual([]);
    });

    it("removes a person from one organisation without touching another", async () => {
      await repo.save(applicant("org-1"));
      await repo.save(applicant("org-2"));
      for (const organisationId of ["org-1", "org-2"]) {
        await repo.addMember(
          IssuerMembership.of({
            organisationId,
            userId: "user-1",
            role: "issuer_admin",
            addedAt: APPLIED_AT,
          }),
        );
      }

      await repo.removeMember("org-1", "user-1");

      expect(await repo.membersOf("org-1")).toEqual([]);
      expect(await repo.membersOf("org-2")).toHaveLength(1);
    });

    it("changes a person's role rather than listing them twice", async () => {
      await repo.save(applicant("org-1"));
      const member = (role: "issuer_admin" | "issuer_contributor") =>
        IssuerMembership.of({
          organisationId: "org-1",
          userId: "user-1",
          role,
          addedAt: APPLIED_AT,
        });
      await repo.addMember(member("issuer_contributor"));
      await repo.addMember(member("issuer_admin"));

      const members = await repo.membersOf("org-1");

      expect(members).toHaveLength(1);
      expect(members[0]?.role).toBe("issuer_admin");
    });
  });
};
