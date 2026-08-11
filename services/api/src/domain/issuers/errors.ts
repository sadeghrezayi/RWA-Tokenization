import { DomainError } from "../identity/errors.js";

export class InvalidIssuerOrganisationError extends DomainError {}

export class InvalidIssuerTransitionError extends DomainError {}

export class InvalidIssuerMembershipError extends DomainError {}
