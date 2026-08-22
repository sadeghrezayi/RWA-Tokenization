import { ApplicationError } from "../identity/errors.js";

// A partial or invented assessment must not be filed. Either the officer
// answered the model the platform asked, or there is no rating — a half-scored
// file reads as a low-risk one. The message names the factor still open, so it
// carries everything the reader needs.
export class IncompleteRiskAssessmentError extends ApplicationError {}
