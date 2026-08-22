import { describe, expect, it } from "vitest";
import { MockSanctionsScreening } from "../../src/infrastructure/screening/mock-sanctions-screening.js";

// The platform invariant is that a fake screening is always labeled as one.
// These tests exist to make that structurally impossible to violate, not to
// check a string: every result this adapter produces must announce itself.
const clock = { now: () => new Date("2026-08-22T10:00:00Z") };

describe("MockSanctionsScreening", () => {
  it("marks every result it produces as simulated", async () => {
    const screening = new MockSanctionsScreening(clock, []);

    const result = await screening.screen({ subjectId: "inv-1", fullName: "Ordinary Person" });

    expect(result.simulated).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.disclaimer()).toBeTruthy();
  });

  it("returns a possible match for a name on its rehearsal list, so the match path is exercisable", async () => {
    const screening = new MockSanctionsScreening(clock, ["Sanctioned Test Person"]);

    const hit = await screening.screen({ subjectId: "inv-2", fullName: "sanctioned test person" });

    expect(hit.outcome).toBe("possible_match");
    // Still simulated: a rehearsal hit is not evidence of anything.
    expect(hit.simulated).toBe(true);
  });

  it("clears everyone else", async () => {
    const screening = new MockSanctionsScreening(clock, ["Sanctioned Test Person"]);

    const result = await screening.screen({ subjectId: "inv-3", fullName: "Someone Else" });

    expect(result.outcome).toBe("clear");
  });

  it("is deterministic — the same name answers the same way twice", async () => {
    const screening = new MockSanctionsScreening(clock, ["Sanctioned Test Person"]);

    const first = await screening.screen({
      subjectId: "inv-4",
      fullName: "Sanctioned Test Person",
    });
    const second = await screening.screen({
      subjectId: "inv-4",
      fullName: "Sanctioned Test Person",
    });

    expect(first.outcome).toBe(second.outcome);
  });
});
