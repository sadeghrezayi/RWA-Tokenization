import { StateMachine } from "../shared/state-machine.js";
import { InvalidIssuerOrganisationError, InvalidIssuerTransitionError } from "./errors.js";

export type IssuerOrganisationState =
  "applied" | "in_review" | "approved" | "rejected" | "suspended";

// An application is reviewed by a person before it becomes anything. Approval
// is reversible (suspend) because "something is wrong here" needs a lever that
// bites immediately; rejection is terminal, because re-applying should be a new
// application rather than a quietly edited old one.
const ISSUER_MACHINE = new StateMachine<IssuerOrganisationState>({
  applied: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["suspended"],
  suspended: ["approved"],
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 3.2: the legal entity that brings assets to the platform.
//
// It is NOT a user. People act on its behalf (see IssuerMembership), and until
// the platform has approved it, it can do nothing at all — the default state
// must never be "allowed to raise money from the public".
export class IssuerOrganisation {
  private constructor(
    public readonly id: string,
    public readonly legalName: string,
    public readonly registrationNumber: string,
    public readonly contactEmail: string,
    public readonly state: IssuerOrganisationState,
    public readonly appliedAt: Date,
    public readonly decidedAt: Date | undefined,
    public readonly decidedBy: string | undefined,
    public readonly rejectionReason: string | undefined,
  ) {}

  static apply(fields: {
    id: string;
    legalName: string;
    registrationNumber: string;
    contactEmail: string;
    appliedAt: Date;
  }): IssuerOrganisation {
    const legalName = required(fields.legalName, "an issuer needs a legal name");
    const registrationNumber = required(
      fields.registrationNumber,
      "an issuer needs a registration number",
    );
    const contactEmail = required(fields.contactEmail, "an issuer needs a contact email");
    if (!EMAIL.test(contactEmail)) {
      throw new InvalidIssuerOrganisationError("the contact must be an email address");
    }
    return new IssuerOrganisation(
      fields.id,
      legalName,
      registrationNumber,
      contactEmail,
      "applied",
      fields.appliedAt,
      undefined,
      undefined,
      undefined,
    );
  }

  static restore(fields: {
    id: string;
    legalName: string;
    registrationNumber: string;
    contactEmail: string;
    state: IssuerOrganisationState;
    appliedAt: Date;
    decidedAt?: Date;
    decidedBy?: string;
    rejectionReason?: string;
  }): IssuerOrganisation {
    return new IssuerOrganisation(
      fields.id,
      fields.legalName,
      fields.registrationNumber,
      fields.contactEmail,
      fields.state,
      fields.appliedAt,
      fields.decidedAt,
      fields.decidedBy,
      fields.rejectionReason,
    );
  }

  startReview(now: Date): IssuerOrganisation {
    return this.transition("in_review", now, undefined, undefined);
  }

  approve(now: Date, officerId: string): IssuerOrganisation {
    return this.transition("approved", now, officerId, undefined);
  }

  reject(now: Date, officerId: string, reason: string): IssuerOrganisation {
    const trimmed = reason.trim();
    if (trimmed === "") {
      // A rejection an applicant cannot understand is a wall, not a decision.
      throw new InvalidIssuerOrganisationError("a rejection needs a reason");
    }
    return this.transition("rejected", now, officerId, trimmed);
  }

  suspend(now: Date, officerId: string, reason: string): IssuerOrganisation {
    const trimmed = reason.trim();
    if (trimmed === "") {
      throw new InvalidIssuerOrganisationError("a suspension needs a reason");
    }
    return this.transition("suspended", now, officerId, trimmed);
  }

  reinstate(now: Date, officerId: string): IssuerOrganisation {
    return this.transition("approved", now, officerId, undefined);
  }

  // The single question the rest of the platform asks about an issuer.
  canSubmitAssets(): boolean {
    return this.state === "approved";
  }

  private transition(
    to: IssuerOrganisationState,
    now: Date,
    officerId: string | undefined,
    reason: string | undefined,
  ): IssuerOrganisation {
    ISSUER_MACHINE.assertCanTransition(this.state, to, (from, target) => {
      throw new InvalidIssuerTransitionError(`cannot move an issuer from "${from}" to "${target}"`);
    });
    return new IssuerOrganisation(
      this.id,
      this.legalName,
      this.registrationNumber,
      this.contactEmail,
      to,
      this.appliedAt,
      now,
      officerId ?? this.decidedBy,
      reason,
    );
  }
}

const required = (value: string, message: string): string => {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new InvalidIssuerOrganisationError(message);
  }
  return trimmed;
};
