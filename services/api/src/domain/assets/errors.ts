import { DomainError } from "../identity/errors.js";

export class InvalidAssetTransitionError extends DomainError {}

export class IncompleteDossierError extends DomainError {}

export class ChecklistIncompleteError extends DomainError {}

export class DossierFrozenError extends DomainError {}

export class InvalidDossierDocumentError extends DomainError {}

export class InvalidCustodyArrangementError extends DomainError {}

export class InvalidTokenAddressError extends DomainError {}

// Distinct from InvalidDossierDocumentError (malformed input, 400): the request
// is well formed, it just conflicts with what the dossier currently holds.
export class DocumentNotInDossierError extends DomainError {
  constructor(kind: string) {
    super(`the dossier holds no ${kind} document`);
  }
}
