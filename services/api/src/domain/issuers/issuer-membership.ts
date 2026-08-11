import { InvalidIssuerMembershipError } from "./errors.js";

// Two roles, split along the line that actually matters: inviting colleagues
// is a different privilege from preparing an asset. More roles are cheap to add
// once a real issuer says they need one — inventing them now would be guessing.
export const ISSUER_ROLES = ["issuer_admin", "issuer_contributor"] as const;

export type IssuerRole = (typeof ISSUER_ROLES)[number];

// A person acting for an organisation. This is what ties a login to an issuer:
// without a membership, a user has no issuer powers at all.
export class IssuerMembership {
  private constructor(
    public readonly organisationId: string,
    public readonly userId: string,
    public readonly role: IssuerRole,
    public readonly addedAt: Date,
  ) {}

  static of(fields: {
    organisationId: string;
    userId: string;
    role: IssuerRole;
    addedAt: Date;
  }): IssuerMembership {
    if (!(ISSUER_ROLES as readonly string[]).includes(fields.role)) {
      throw new InvalidIssuerMembershipError(`"${fields.role}" is not an issuer role`);
    }
    return new IssuerMembership(
      required(fields.organisationId, "a membership needs an organisation"),
      required(fields.userId, "a membership needs a person"),
      fields.role,
      fields.addedAt,
    );
  }

  canManageTeam(): boolean {
    return this.role === "issuer_admin";
  }

  canWorkOnAssets(): boolean {
    return true;
  }
}

const required = (value: string, message: string): string => {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new InvalidIssuerMembershipError(message);
  }
  return trimmed;
};
