export class InvalidScreeningResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScreeningResultError";
  }
}
