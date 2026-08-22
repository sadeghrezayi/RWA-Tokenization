import { NothingToScreenError } from "./errors.js";
import type { SanctionsScreening, ScreeningRepository } from "./ports.js";
import type { ScreeningResult } from "../../domain/screening/screening-result.js";
import type { StepAnswerStore } from "../onboarding/ports.js";

// 4.2: run a sanctions/PEP check on an applicant and keep what came back.
//
// The name screened is the one the applicant DECLARED in their profile step,
// not a display label or an email — a screening is only as meaningful as the
// identity it was run against, and that is the identity they claimed.
//
// Every result is kept, including repeats: a screening re-run months later is a
// new fact about a new moment, not a correction of the old one. Compliance
// wants the history, not the latest row.
export class ScreenInvestor {
  constructor(
    private readonly answers: StepAnswerStore,
    private readonly screening: SanctionsScreening,
    private readonly results: ScreeningRepository,
  ) {}

  async execute(input: { investorId: string }): Promise<ScreeningResult> {
    const all = await this.answers.readAll(input.investorId);
    const declared = all.profile?.fullName;
    const fullName = typeof declared === "string" ? declared.trim() : "";
    if (fullName === "") {
      throw new NothingToScreenError();
    }

    const result = await this.screening.screen({ subjectId: input.investorId, fullName });
    await this.results.save(result);
    return result;
  }
}
