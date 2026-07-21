import { DomainError } from "../identity/errors.js";

export class InvalidStageError extends DomainError {}
export class InvalidTagError extends DomainError {}
export class InvalidNoteError extends DomainError {}
export class InvalidFollowUpError extends DomainError {}
export class InvalidFollowUpTransitionError extends DomainError {}
