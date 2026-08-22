// A risk assessment that is malformed must not exist at all: a half-built one
// would still be read as a judgement about a person.
export class InvalidRiskAssessmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRiskAssessmentError";
  }
}
