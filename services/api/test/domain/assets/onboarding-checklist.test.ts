import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ITEMS,
  OnboardingChecklist,
} from "../../../src/domain/assets/onboarding-checklist.js";

// FR-AO-4: the structured onboarding checklist gating operator approval.
describe("OnboardingChecklist", () => {
  it("starts_with_every_item_unconfirmed", () => {
    const checklist = OnboardingChecklist.empty();
    expect(checklist.allConfirmed()).toBe(false);
    expect(checklist.unconfirmedItems()).toEqual([...CHECKLIST_ITEMS]);
  });

  it("confirms_items_one_by_one", () => {
    const checklist = OnboardingChecklist.empty().confirm("legal_right_clear");
    expect(checklist.isConfirmed("legal_right_clear")).toBe(true);
    expect(checklist.isConfirmed("transferable")).toBe(false);
    expect(checklist.unconfirmedItems()).not.toContain("legal_right_clear");
  });

  it("is_all_confirmed_only_when_every_item_is_confirmed", () => {
    const allDone = CHECKLIST_ITEMS.reduce(
      (acc, item) => acc.confirm(item),
      OnboardingChecklist.empty(),
    );
    expect(allDone.allConfirmed()).toBe(true);
    expect(allDone.unconfirmedItems()).toEqual([]);
  });

  it("confirming_twice_is_idempotent", () => {
    const twice = OnboardingChecklist.empty().confirm("transferable").confirm("transferable");
    expect(twice.isConfirmed("transferable")).toBe(true);
  });

  it("is_immutable_confirm_returns_a_new_checklist", () => {
    const empty = OnboardingChecklist.empty();
    empty.confirm("legal_right_clear");
    expect(empty.isConfirmed("legal_right_clear")).toBe(false);
  });
});
