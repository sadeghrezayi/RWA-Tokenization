export class OnboardingNotStartedError extends Error {
  constructor(investorId: string) {
    super(`investor ${investorId} has not started an onboarding application`);
    this.name = "OnboardingNotStartedError";
  }
}

export class UnsupportedEvidenceTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedEvidenceTypeError";
  }
}

export class EvidenceTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`a document may be at most ${String(maxBytes)} bytes`);
    this.name = "EvidenceTooLargeError";
  }
}

// Deliberately the same answer for "not yours" and "does not exist": an
// applicant must not be able to probe for other people's documents.
export class EvidenceNotFoundError extends Error {
  constructor(reference: string) {
    super(`no evidence ${reference} is available`);
    this.name = "EvidenceNotFoundError";
  }
}

export class MissingIdentityEvidenceError extends Error {
  constructor() {
    super("the identity-evidence step needs at least one uploaded document");
    this.name = "MissingIdentityEvidenceError";
  }
}

// "rejected" is terminal in the KYC state machine. Accepting a resubmission
// would leave the applicant waiting on a review that can never be queued, so
// the dead end is stated instead of hidden. Whether a rejected applicant may
// re-apply at all is an open product decision.
export class KycDecisionIsFinalError extends Error {
  constructor() {
    super("this application was already decided and cannot be resubmitted");
    this.name = "KycDecisionIsFinalError";
  }
}

export class InvalidStepAnswersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStepAnswersError";
  }
}
