import { describe, expect, it } from "vitest";
import { ScreeningResult } from "../../../src/domain/screening/screening-result.js";

// Phase 4.2. The platform's own invariant: "fake screenings/compliance always
// labeled as mock". A screening that cannot say what produced it is worse than
// no screening — someone will read "clear" and believe a sanctions list was
// consulted when nothing was.
const CHECKED_AT = new Date("2026-08-22T10:00:00Z");

describe("ScreeningResult", () => {
  it("carries the provider that produced it, not just the outcome", () => {
    const result = ScreeningResult.of({
      subjectId: "inv-1",
      outcome: "clear",
      provider: "mock",
      simulated: true,
      checkedAt: CHECKED_AT,
    });

    expect(result.outcome).toBe("clear");
    expect(result.provider).toBe("mock");
    expect(result.simulated).toBe(true);
  });

  it("refuses a result that claims to be real without naming a provider", () => {
    expect(() =>
      ScreeningResult.of({
        subjectId: "inv-1",
        outcome: "clear",
        provider: "",
        simulated: false,
        checkedAt: CHECKED_AT,
      }),
    ).toThrow(/provider/i);
  });

  it("refuses a result with no subject, because a screening is about someone", () => {
    expect(() =>
      ScreeningResult.of({
        subjectId: "  ",
        outcome: "clear",
        provider: "mock",
        simulated: true,
        checkedAt: CHECKED_AT,
      }),
    ).toThrow(/subject/i);
  });

  // The whole point: a simulated result must be unable to pass as a real one.
  it("says out loud that a simulated result decides nothing", () => {
    const simulated = ScreeningResult.of({
      subjectId: "inv-1",
      outcome: "clear",
      provider: "mock",
      simulated: true,
      checkedAt: CHECKED_AT,
    });

    // Two things it must convey, phrased however: that it is not real, and
    // that nobody should act on it. Asserting an exact sentence would make this
    // a spell-checker; asserting neither would let "clear" stand alone.
    expect(simulated.disclaimer()).toMatch(/simulated|mock/i);
    expect(simulated.disclaimer()).toMatch(/decides nothing|no .*(list|sanctions).*check/i);
  });

  it("has no disclaimer to make when a real provider answered", () => {
    const real = ScreeningResult.of({
      subjectId: "inv-1",
      outcome: "possible_match",
      provider: "acme-sanctions",
      simulated: false,
      checkedAt: CHECKED_AT,
    });

    expect(real.disclaimer()).toBeUndefined();
  });
});
