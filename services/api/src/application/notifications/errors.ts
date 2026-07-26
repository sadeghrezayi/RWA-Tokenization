// Requested notification does not exist for the acting recipient (either the id
// is unknown, or it belongs to someone else — indistinguishable on purpose, so a
// user cannot probe others' notifications).
export class NotificationNotFoundError extends Error {
  constructor(id: string) {
    super(`notification "${id}" not found`);
    this.name = "NotificationNotFoundError";
  }
}
