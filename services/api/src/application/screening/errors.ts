import { ApplicationError } from "../identity/errors.js";

// Screening nobody and filing the answer would be worse than not screening at
// all: a "clear" result would sit on the record of a person nobody checked.
export class NothingToScreenError extends ApplicationError {
  constructor() {
    super("this applicant has not declared a name yet, so there is nothing to screen");
  }
}
