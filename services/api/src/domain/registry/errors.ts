import { DomainError } from "../identity/errors.js";

export class InvalidRegistryEventError extends DomainError {}

// The chain event stream is incomplete or out of order — the registry must
// fail loudly rather than publish a wrong holder list (NFR-2).
export class CorruptEventStreamError extends DomainError {}
