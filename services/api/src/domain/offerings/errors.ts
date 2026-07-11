import { DomainError } from "../identity/errors.js";

export class InvalidOfferingConfigError extends DomainError {}

export class InvalidOfferingTransitionError extends DomainError {}

export class SubscriptionWindowClosedError extends DomainError {}

export class SubscriptionLimitError extends DomainError {}
