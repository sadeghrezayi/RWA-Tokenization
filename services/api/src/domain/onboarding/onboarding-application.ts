import {
  EntityOnboardingNotAvailableError,
  InvalidOnboardingTransitionError,
  OnboardingIncompleteError,
} from "./errors.js";

// 2.3: the evidence an individual must provide before a KYC decision can be
// made. Order is the order the wizard presents them, not a constraint — an
// applicant may complete them in any order.
export const ONBOARDING_STEPS = [
  "profile",
  "identity_evidence",
  "bank_account",
  "suitability",
  "agreements",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Individual only for now; "entity" exists so the refusal is explicit rather
// than an applicant silently going down the individual path (OD-14/KYB).
export type ApplicantKind = "individual" | "entity";

// This is the COLLECTION lifecycle, deliberately distinct from KycStatus, which
// remains the authority on whether an investor is approved. Duplicating that
// state machine here would create two answers to "is this investor cleared".
export type OnboardingStatus = "in_progress" | "submitted" | "changes_requested";

export interface ChangeRequest {
  step: OnboardingStep;
  reason: string;
}

export interface OnboardingSnapshot {
  id: string;
  investorId: string;
  kind: ApplicantKind;
  status: OnboardingStatus;
  completed: readonly OnboardingStep[];
  changeRequests: readonly ChangeRequest[];
  startedAt: Date;
  submittedAt?: Date;
}

export class OnboardingApplication {
  private constructor(
    public readonly id: string,
    public readonly investorId: string,
    public readonly kind: ApplicantKind,
    public readonly status: OnboardingStatus,
    private readonly completed: ReadonlySet<OnboardingStep>,
    public readonly changeRequests: readonly ChangeRequest[],
    public readonly startedAt: Date,
    public readonly submittedAt?: Date,
  ) {}

  static start(input: {
    id: string;
    investorId: string;
    kind: ApplicantKind;
    now: Date;
  }): OnboardingApplication {
    if (input.kind === "entity") {
      throw new EntityOnboardingNotAvailableError();
    }
    return new OnboardingApplication(
      input.id,
      input.investorId,
      input.kind,
      "in_progress",
      new Set(),
      [],
      input.now,
    );
  }

  static restore(snapshot: OnboardingSnapshot): OnboardingApplication {
    return new OnboardingApplication(
      snapshot.id,
      snapshot.investorId,
      snapshot.kind,
      snapshot.status,
      new Set(snapshot.completed),
      [...snapshot.changeRequests],
      snapshot.startedAt,
      snapshot.submittedAt,
    );
  }

  completedSteps(): OnboardingStep[] {
    return ONBOARDING_STEPS.filter((step) => this.completed.has(step));
  }

  outstandingSteps(): OnboardingStep[] {
    return ONBOARDING_STEPS.filter((step) => !this.completed.has(step));
  }

  isReadyToSubmit(): boolean {
    return this.outstandingSteps().length === 0;
  }

  // Idempotent — re-completing a step is a no-op rather than an error, because
  // a wizard legitimately re-saves the same screen.
  completeStep(step: OnboardingStep): OnboardingApplication {
    if (this.status === "submitted") {
      throw new InvalidOnboardingTransitionError(
        "an application under review cannot be edited; ask the reviewer for changes first",
      );
    }
    if (this.completed.has(step)) {
      return this;
    }
    return this.with({ completed: new Set([...this.completed, step]) });
  }

  submit(now: Date): OnboardingApplication {
    if (this.status === "submitted") {
      throw new InvalidOnboardingTransitionError("this application is already under review");
    }
    if (!this.isReadyToSubmit()) {
      throw new OnboardingIncompleteError(this.outstandingSteps());
    }
    // Clearing the previous round's notes: they described an earlier version of
    // the application and would otherwise linger as if still outstanding.
    return this.with({ status: "submitted", changeRequests: [], submittedAt: now });
  }

  // The reviewer sends it back naming exactly what is wrong. Only those steps
  // reopen, so the applicant is not made to redo work that was accepted.
  requestChanges(requests: readonly ChangeRequest[]): OnboardingApplication {
    if (this.status !== "submitted") {
      throw new InvalidOnboardingTransitionError(
        "only a submitted application can be sent back for changes",
      );
    }
    if (requests.length === 0) {
      throw new InvalidOnboardingTransitionError(
        "sending an application back requires at least one reason",
      );
    }
    const reopened = new Set(this.completed);
    for (const request of requests) {
      reopened.delete(request.step);
    }
    return this.with({
      status: "changes_requested",
      completed: reopened,
      changeRequests: [...requests],
    });
  }

  private with(changes: {
    status?: OnboardingStatus;
    completed?: ReadonlySet<OnboardingStep>;
    changeRequests?: readonly ChangeRequest[];
    submittedAt?: Date;
  }): OnboardingApplication {
    return new OnboardingApplication(
      this.id,
      this.investorId,
      this.kind,
      changes.status ?? this.status,
      changes.completed ?? this.completed,
      changes.changeRequests ?? this.changeRequests,
      this.startedAt,
      changes.submittedAt ?? this.submittedAt,
    );
  }
}
