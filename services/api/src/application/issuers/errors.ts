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
