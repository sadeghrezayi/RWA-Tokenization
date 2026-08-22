import { ScreeningResult } from "../../domain/screening/screening-result.js";
import type { SanctionsScreening } from "../../application/screening/ports.js";
import type { Clock } from "../../application/offerings/ports.js";

// A screening that checks nothing (4.2).
//
// It exists so the rest of the platform — the use case, the queue, the screen —
// can be built and exercised before a provider is chosen, which is an owner
// decision of the same kind as OD-7. It is NOT a stand-in that might quietly
// become production: every result it returns is stamped `simulated`, carries a
// disclaimer, and names itself "mock". The platform's standing invariant is
// that fake compliance is always labeled as such, and this is where that starts.
//
// The rehearsal list makes the match path reachable in a demo without inventing
// a hit at random: a deterministic answer is testable and cannot mislead anyone
// into thinking a real list produced it.
export const MOCK_SCREENING_PROVIDER = "mock";

export class MockSanctionsScreening implements SanctionsScreening {
  constructor(
    private readonly clock: Clock,
    private readonly rehearsalMatches: readonly string[],
  ) {}

  screen(subject: { subjectId: string; fullName: string }): Promise<ScreeningResult> {
    const normalise = (name: string) => name.trim().toLowerCase();
    const hit = this.rehearsalMatches.some(
      (name) => normalise(name) === normalise(subject.fullName),
    );
    return Promise.resolve(
      ScreeningResult.of({
        subjectId: subject.subjectId,
        outcome: hit ? "possible_match" : "clear",
        provider: MOCK_SCREENING_PROVIDER,
        // Never configurable. An adapter that checks nothing must not be able
        // to claim otherwise, whatever it is wired with.
        simulated: true,
        checkedAt: this.clock.now(),
      }),
    );
  }
}
