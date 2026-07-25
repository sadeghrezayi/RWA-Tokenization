import { describe, expect, it } from "vitest";
import { StateMachine } from "../../../src/domain/shared/state-machine.js";

type S = "draft" | "open" | "closed" | "cancelled";

const machine = new StateMachine<S>({
  draft: ["open", "cancelled"],
  open: ["closed", "cancelled"],
  // closed / cancelled are terminal (no outgoing transitions).
});

describe("StateMachine", () => {
  it("allows_declared_transitions_and_rejects_others", () => {
    expect(machine.canTransition("draft", "open")).toBe(true);
    expect(machine.canTransition("open", "closed")).toBe(true);
    expect(machine.canTransition("draft", "closed")).toBe(false); // must go via open
    expect(machine.canTransition("closed", "open")).toBe(false); // terminal
    expect(machine.canTransition("cancelled", "open")).toBe(false); // terminal/undeclared
  });

  it("reports_the_allowed_targets_of_a_state", () => {
    expect([...machine.allowedTargets("draft")]).toEqual(["open", "cancelled"]);
    expect([...machine.allowedTargets("closed")]).toEqual([]);
  });

  it("runs_onInvalid_only_for_a_disallowed_transition", () => {
    let called = 0;
    machine.assertCanTransition("draft", "open", () => {
      called += 1;
      throw new Error("should not run");
    });
    expect(called).toBe(0);

    expect(() => {
      machine.assertCanTransition("draft", "closed", (from, to) => {
        throw new Error(`bad ${from}->${to}`);
      });
    }).toThrow("bad draft->closed");
  });
});
