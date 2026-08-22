import { describe, expect, it } from "vitest";
import { ScreenInvestor } from "../../../src/application/screening/screen-investor.js";
import { NothingToScreenError } from "../../../src/application/screening/errors.js";
import { MockSanctionsScreening } from "../../../src/infrastructure/screening/mock-sanctions-screening.js";
import { InMemoryScreeningRepository } from "../../fakes/screening-fakes.js";

const clock = { now: () => new Date("2026-08-22T10:00:00Z") };

// The answers an applicant gave; the name to screen comes from their profile
// step, because that is the name they declared, not a display label.
const answersFor = (fullName?: string) => ({
  readAll: () => Promise.resolve(fullName === undefined ? {} : { profile: { fullName } }),
});

const setup = (fullName: string | undefined, rehearsal: string[] = []) => {
  const results = new InMemoryScreeningRepository();
  return {
    results,
    screen: new ScreenInvestor(
      answersFor(fullName) as never,
      new MockSanctionsScreening(clock, rehearsal),
      results,
    ),
  };
};

describe("ScreenInvestor", () => {
  it("screens the name the applicant declared and keeps the result", async () => {
    const app = setup("Ordinary Person");

    const result = await app.screen.execute({ investorId: "inv-1" });

    expect(result.outcome).toBe("clear");
    const kept = await app.results.findForSubject("inv-1");
    expect(kept).toHaveLength(1);
    expect(kept[0]?.provider).toBe("mock");
  });

  it("keeps a possible match too — especially that one", async () => {
    const app = setup("Sanctioned Test Person", ["Sanctioned Test Person"]);

    await app.screen.execute({ investorId: "inv-2" });

    const kept = await app.results.findForSubject("inv-2");
    expect(kept[0]?.outcome).toBe("possible_match");
  });

  // The failure that matters: screening nobody and recording "clear" would put
  // a clean result on file for a person who was never checked.
  it("refuses to screen an applicant who has declared no name", async () => {
    const app = setup(undefined);

    await expect(app.screen.execute({ investorId: "inv-3" })).rejects.toThrow(NothingToScreenError);

    expect(await app.results.findForSubject("inv-3")).toEqual([]);
  });

  it("keeps every screening, so the history is a history", async () => {
    const app = setup("Ordinary Person");

    await app.screen.execute({ investorId: "inv-4" });
    await app.screen.execute({ investorId: "inv-4" });

    // A re-run months later is a new fact, not a correction of the old one.
    expect(await app.results.findForSubject("inv-4")).toHaveLength(2);
  });
});
