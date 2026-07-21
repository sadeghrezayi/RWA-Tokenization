import { ApplicationError } from "../identity/errors.js";

export class FollowUpNotFoundError extends ApplicationError {
  constructor(id: string) {
    super(`no follow-up found with id "${id}"`);
  }
}
