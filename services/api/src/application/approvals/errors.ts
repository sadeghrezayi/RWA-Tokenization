export class ApprovalNotFoundError extends Error {
  constructor(approvalId: string) {
    super(`no approval found with id "${approvalId}"`);
    this.name = "ApprovalNotFoundError";
  }
}
