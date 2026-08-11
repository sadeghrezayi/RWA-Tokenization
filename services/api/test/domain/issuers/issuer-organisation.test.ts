import { describe, expect, it } from "vitest";
import { IssuerOrganisation } from "../../../src/domain/issuers/issuer-organisation.js";
import {
  InvalidIssuerOrganisationError,
  InvalidIssuerTransitionError,
} from "../../../src/domain/issuers/errors.js";

const applied = () =>
  IssuerOrganisation.apply({
    id: "org-1",
    legalName: "Vanak Property Holdings PJSC",
    registrationNumber: "IR-448120",
    contactEmail: "ops@vanakholdings.example",
    appliedAt: new Date("2026-08-01T09:00:00Z"),
  });

const REVIEWED = new Date("2026-08-02T09:00:00Z");

// 3.2: an organisation that brings assets to the platform. It is NOT a user —
// it is a legal entity whose people act on its behalf, and it cannot do
// anything until the platform has approved it.
describe("IssuerOrganisation", () => {
  it("starts as an application, not as a participant", () => {
    // The default must never be "allowed to raise money".
    const organisation = applied();

    expect(organisation.state).toBe("applied");
    expect(organisation.canSubmitAssets()).toBe(false);
  });

  it("may bring assets only once the platform has approved it", () => {
    const organisation = applied().startReview(REVIEWED).approve(REVIEWED, "officer-1");

    expect(organisation.state).toBe("approved");
    expect(organisation.canSubmitAssets()).toBe(true);
    expect(organisation.decidedBy).toBe("officer-1");
  });

  it("records why an application was rejected", () => {
    // A rejection an applicant cannot understand is not a decision, it is a
    // wall. The reason travels with the record.
    const organisation = applied()
      .startReview(REVIEWED)
      .reject(REVIEWED, "officer-1", "registration number does not match the registry");

    expect(organisation.state).toBe("rejected");
    expect(organisation.rejectionReason).toBe("registration number does not match the registry");
    expect(organisation.canSubmitAssets()).toBe(false);
  });

  it("refuses a rejection with no reason", () => {
    expect(() => applied().startReview(REVIEWED).reject(REVIEWED, "officer-1", "  ")).toThrow(
      InvalidIssuerOrganisationError,
    );
  });

  it("suspends an approved organisation, stopping new assets at once", () => {
    // Suspension is the lever for "something is wrong here" and it must bite
    // immediately, not at the next submission.
    const organisation = applied()
      .startReview(REVIEWED)
      .approve(REVIEWED, "officer-1")
      .suspend(REVIEWED, "officer-2", "under investigation");

    expect(organisation.state).toBe("suspended");
    expect(organisation.canSubmitAssets()).toBe(false);
  });

  it("restores a suspended organisation", () => {
    const organisation = applied()
      .startReview(REVIEWED)
      .approve(REVIEWED, "officer-1")
      .suspend(REVIEWED, "officer-2", "under investigation")
      .reinstate(REVIEWED, "officer-2");

    expect(organisation.state).toBe("approved");
    expect(organisation.canSubmitAssets()).toBe(true);
  });

  it("refuses to approve something nobody has reviewed", () => {
    // Approval is a decision taken by a person who looked; skipping review
    // would let an application slip straight through.
    expect(() => applied().approve(REVIEWED, "officer-1")).toThrow(InvalidIssuerTransitionError);
  });

  it("refuses to decide the same application twice", () => {
    const decided = applied().startReview(REVIEWED).approve(REVIEWED, "officer-1");

    expect(() => decided.approve(REVIEWED, "officer-1")).toThrow(InvalidIssuerTransitionError);
  });

  it("needs a legal name, a registration number and a contact", () => {
    // Each is how a real entity is identified, chased, or served notice.
    for (const missing of ["legalName", "registrationNumber", "contactEmail"] as const) {
      expect(() =>
        IssuerOrganisation.apply({
          id: "org-2",
          legalName: "Name",
          registrationNumber: "REG",
          contactEmail: "a@b.example",
          appliedAt: new Date(),
          [missing]: "   ",
        }),
      ).toThrow(InvalidIssuerOrganisationError);
    }
  });

  it("refuses a contact that is not an email address", () => {
    expect(() =>
      IssuerOrganisation.apply({
        id: "org-3",
        legalName: "Name",
        registrationNumber: "REG",
        contactEmail: "not-an-email",
        appliedAt: new Date(),
      }),
    ).toThrow(InvalidIssuerOrganisationError);
  });
});
