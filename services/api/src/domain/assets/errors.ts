import { DomainError } from "../identity/errors.js";

export class InvalidAssetTransitionError extends DomainError {}

export class IncompleteDossierError extends DomainError {}

export class ChecklistIncompleteError extends DomainError {}

export class DossierFrozenError extends DomainError {}

export class InvalidDossierDocumentError extends DomainError {}

export class InvalidCustodyArrangementError extends DomainError {}

export class InvalidTokenAddressError extends DomainError {}
