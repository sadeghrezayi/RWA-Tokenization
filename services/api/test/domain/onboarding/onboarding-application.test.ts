import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  OnboardingApplication,
} from "../../../src/domain/onboarding/onboarding-application.js";
import {
  EntityOnboardingNotAvailableError,
  InvalidOnboardingTransitionError,
  OnboardingIncompleteError,
} from "../../../src/domain/onboarding/errors.js";

const NOW = new Date("2026-07-31T10:00:00Z");
const LATER = new Date("2026-08-01T10:00:00Z");

const started = () =>
  OnboardingApplication.start({ id: "app-1", investorId: "inv-1", kind: "individual", now: NOW });

const completeAll = (app: OnboardingApplication): OnboardingApplication =>
  ONBOARDING_STEPS.reduce((acc, step) => acc.completeStep(step), app);

describe("OnboardingApplication — starting", () => {
  it("starts with every step outstanding", () => {
    const app = started();
    expect(app.completedSteps()).toEqual([]);
    expect(app.outstandingSteps()).toEqual([...ONBOARDING_STEPS]);
    expect(app.isReadyToSubmit()).toBe(false);
  });

  it("refuses an entity application while KYB is unavailable", () => {
    // Entity onboarding is behind a flag: refusing loudly is better than
    // silently treating a company as an individual.
    expect(() =>
      OnboardingApplication.start({ id: "app-2", investorId: "inv-2", kind: "entity", now: NOW }),
    ).toThrow(EntityOnboardingNotAvailableError);
  });
});

describe("OnboardingApplication — progress", () => {
  it("tracks completion in any order the applicant chooses", () => {
    const app = started().completeStep("agreements").completeStep("profile");

    expect(app.completedSteps().sort()).toEqual(["agreements", "profile"]);
    expect(app.outstandingSteps()).not.toContain("profile");
    expect(app.isReadyToSubmit()).toBe(false); // others still outstanding
  });

  it("is idempotent when a step is completed twice", () => {
    const once = started().completeStep("profile");
    expect(once.completeStep("profile").completedSteps()).toEqual(["profile"]);
  });

  it("is ready only when every step is done", () => {
    expect(completeAll(started()).isReadyToSubmit()).toBe(true);
  });
});

describe("OnboardingApplication — submission", () => {
  it("submits a complete application", () => {
    const submitted = completeAll(started()).submit(NOW);
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toEqual(NOW);
  });

  it("refuses to submit while steps are outstanding", () => {
    // The officer's queue must never receive a half-filled application.
    expect(() => started().completeStep("profile").submit(NOW)).toThrow(OnboardingIncompleteError);
  });

  it("refuses to submit twice", () => {
    const submitted = completeAll(started()).submit(NOW);
    expect(() => submitted.submit(LATER)).toThrow(InvalidOnboardingTransitionError);
  });

  it("cannot be edited while it is with the reviewer", () => {
    const submitted = completeAll(started()).submit(NOW);
    expect(() => submitted.completeStep("profile")).toThrow(InvalidOnboardingTransitionError);
  });
});

describe("OnboardingApplication — resubmission loop", () => {
  const submitted = () => completeAll(started()).submit(NOW);

  it("reopens only the steps the reviewer asked about", () => {
    const returned = submitted().requestChanges([
      { step: "identity_evidence", reason: "photo is unreadable" },
    ]);

    expect(returned.status).toBe("changes_requested");
    // Precisely the named step is outstanding again — the applicant is not made
    // to redo work the reviewer accepted.
    expect(returned.outstandingSteps()).toEqual(["identity_evidence"]);
    expect(returned.isReadyToSubmit()).toBe(false);
  });

  it("tells the applicant why, per step", () => {
    const returned = submitted().requestChanges([
      { step: "bank_account", reason: "account name does not match" },
    ]);
    expect(returned.changeRequests).toEqual([
      { step: "bank_account", reason: "account name does not match" },
    ]);
  });

  it("lets the applicant fix and resubmit", () => {
    const returned = submitted().requestChanges([{ step: "identity_evidence", reason: "blurry" }]);

    const fixed = returned.completeStep("identity_evidence");
    expect(fixed.isReadyToSubmit()).toBe(true);

    const resubmitted = fixed.submit(LATER);
    expect(resubmitted.status).toBe("submitted");
    // The previous round's notes are cleared — they no longer apply.
    expect(resubmitted.changeRequests).toEqual([]);
  });

  it("requires at least one reason, so a rejection is never unexplained", () => {
    expect(() => submitted().requestChanges([])).toThrow(InvalidOnboardingTransitionError);
  });

  it("only asks for changes on something actually submitted", () => {
    expect(() => started().requestChanges([{ step: "profile", reason: "missing" }])).toThrow(
      InvalidOnboardingTransitionError,
    );
  });
});

describe("OnboardingApplication — persistence seam", () => {
  it("round-trips through restore", () => {
    const returned = completeAll(started())
      .submit(NOW)
      .requestChanges([{ step: "suitability", reason: "incomplete" }]);

    const restored = OnboardingApplication.restore({
      id: returned.id,
      investorId: returned.investorId,
      kind: returned.kind,
      status: returned.status,
      completed: returned.completedSteps(),
      changeRequests: returned.changeRequests,
      startedAt: NOW,
      // exactOptionalPropertyTypes: an optional property is omitted, never set
      // to undefined explicitly.
      ...(returned.submittedAt !== undefined ? { submittedAt: returned.submittedAt } : {}),
    });

    expect(restored.status).toBe("changes_requested");
    expect(restored.outstandingSteps()).toEqual(["suitability"]);
    expect(restored.changeRequests).toEqual([{ step: "suitability", reason: "incomplete" }]);
  });
});
