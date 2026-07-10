import { InvalidKycTransitionError, InvalidRejectionReasonError } from "./errors.js";

// FR-ID-2: draft → submitted → in_review → approved / rejected / expired
export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

export class KycStatus {
  private constructor(
    public readonly state: KycState,
    public readonly rejectionReason?: string,
  ) {}

  static draft(): KycStatus {
    return new KycStatus("draft");
  }

  // Persistence-only: rehydrates a stored status without replaying transitions.
  static restore(state: KycState, rejectionReason?: string): KycStatus {
    return new KycStatus(state, rejectionReason);
  }

  submit(): KycStatus {
    return this.transition("submit", "draft", "submitted");
  }

  startReview(): KycStatus {
    return this.transition("start review on", "submitted", "in_review");
  }

  approve(): KycStatus {
    return this.transition("approve", "in_review", "approved");
  }

  reject(reason: string): KycStatus {
    this.assertState("reject", "in_review");
    const trimmed = reason.trim();
    if (trimmed === "") {
      throw new InvalidRejectionReasonError("a rejection must state a non-empty reason");
    }
    return new KycStatus("rejected", trimmed);
  }

  expire(): KycStatus {
    return this.transition("expire", "approved", "expired");
  }

  private transition(action: string, requiredState: KycState, to: KycState): KycStatus {
    this.assertState(action, requiredState);
    return new KycStatus(to);
  }

  private assertState(action: string, requiredState: KycState): void {
    if (this.state !== requiredState) {
      throw new InvalidKycTransitionError(
        `cannot ${action} a KYC application in state "${this.state}"`,
      );
    }
  }
}
