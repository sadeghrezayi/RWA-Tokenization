import { ApplicationError } from "../identity/errors.js";

export class IssuerOrganisationNotFoundError extends ApplicationError {
  constructor(organisationId: string) {
    super(`no issuer organisation found with id "${organisationId}"`);
  }
}

// The company being verified is not enough: every person acting for an issuer
// must be individually verified too (user decision, 2026-08-15).
export class PersonNotVerifiedError extends ApplicationError {
  constructor(userId: string) {
    super(`"${userId}" has not completed individual verification`);
  }
}

// Colleagues are invited by email. When nobody holds that address, say so —
// the admin's next move is to ask them to register, and a silent failure or a
// blank 500 would tell them nothing.
export class PersonNotFoundError extends ApplicationError {
  constructor(email: string) {
    super(`no platform account is registered to "${email}"`);
  }
}

// Resource-level authorization: acting for an issuer is membership, which no
// platform-wide permission can express.
//
// The message names NOBODY by id. The person reading it is the person being
// refused — reciting their own account UUID back at them is noise, and the
// organisation's id is already in the address bar they typed. Same reasoning
// as LastIssuerAdminError; this is a recurring trap in this codebase (K-19).
export class NotIssuerTeamMemberError extends ApplicationError {
  constructor() {
    super("you do not act for this issuer organisation");
  }
}

// An organisation must keep at least one administrator, or it can never staff
// itself again. The message carries no id: it is read by someone already
// looking at the organisation, and a UUID would be noise, not information.
export class LastIssuerAdminError extends ApplicationError {
  constructor() {
    super("this organisation must keep at least one administrator");
  }
}

export class NotIssuerAdminError extends ApplicationError {
  constructor(userId: string, organisationId: string) {
    super(`"${userId}" is not an administrator of issuer organisation "${organisationId}"`);
  }
}
