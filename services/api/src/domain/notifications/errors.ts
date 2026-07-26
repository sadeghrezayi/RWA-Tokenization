// A notification could not be constructed from the given input (empty required
// field). Thrown by the domain, never by callers.
export class InvalidNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationError";
  }
}
