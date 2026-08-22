import type { ScreeningResult } from "../../domain/screening/screening-result.js";
import type { ScreeningRepository } from "./ports.js";

export interface ScreeningView {
  outcome: string;
  provider: string;
  simulated: boolean;
  checkedAt: string;
  // Present only when the result is simulated. Sent to every reader rather than
  // left for each screen to remember, because a caller that forgets it shows a
  // fake "clear" as though a list had been checked (4.2).
  disclaimer?: string;
}

export const toScreeningView = (result: ScreeningResult): ScreeningView => {
  const disclaimer = result.disclaimer();
  return {
    outcome: result.outcome,
    provider: result.provider,
    simulated: result.simulated,
    checkedAt: result.checkedAt.toISOString(),
    ...(disclaimer === undefined ? {} : { disclaimer }),
  };
};

export class ListScreenings {
  constructor(private readonly results: ScreeningRepository) {}

  async execute(input: { investorId: string }): Promise<ScreeningView[]> {
    const found = await this.results.findForSubject(input.investorId);
    return found.map(toScreeningView);
  }
}
