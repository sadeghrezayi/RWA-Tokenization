// Deliberately the same answer for "not yours" and "does not exist": an
// investor must not be able to probe for other people's funding requests.
export class FundingRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`no funding request ${id} is available`);
    this.name = "FundingRequestNotFoundError";
  }
}
