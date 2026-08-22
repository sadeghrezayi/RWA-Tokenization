import { InvalidScreeningResultError } from "./errors.js";

// What a sanctions/PEP check said about one person, at one moment (4.2).
export type ScreeningOutcome = "clear" | "possible_match";

// The platform's standing invariant: "fake screenings/compliance always labeled
// as mock". That label lives HERE, in the result itself, rather than in a log
// line or a UI string — because a result travels: into the database, into a
// report, into a regulator's hands. Anywhere it lands, it has to be able to say
// what produced it. A screening that cannot is worse than none, since someone
// will read "clear" and believe a list was consulted when nothing was.
export class ScreeningResult {
  private constructor(
    public readonly subjectId: string,
    public readonly outcome: ScreeningOutcome,
    public readonly provider: string,
    public readonly simulated: boolean,
    public readonly checkedAt: Date,
  ) {}

  static of(fields: {
    subjectId: string;
    outcome: ScreeningOutcome;
    provider: string;
    simulated: boolean;
    checkedAt: Date;
  }): ScreeningResult {
    const subjectId = fields.subjectId.trim();
    if (subjectId === "") {
      throw new InvalidScreeningResultError("a screening is about someone: subject is required");
    }
    const provider = fields.provider.trim();
    if (provider === "") {
      throw new InvalidScreeningResultError(
        "a screening result must name the provider that produced it",
      );
    }
    return new ScreeningResult(
      subjectId,
      fields.outcome,
      provider,
      fields.simulated,
      fields.checkedAt,
    );
  }

  // The words that must accompany a simulated result wherever it is shown. Not
  // optional prose: without it, a mock "clear" is indistinguishable from a real
  // one to whoever reads it next.
  disclaimer(): string | undefined {
    if (!this.simulated) {
      return undefined;
    }
    return "SIMULATED — no sanctions or PEP list was checked. This result decides nothing.";
  }
}
