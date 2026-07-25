import { StateMachine } from "../shared/state-machine.js";
import { InvalidKycTransitionError, InvalidRejectionReasonError } from "./errors.js";

// FR-ID-2: draft → submitted → in_review → approved / rejected / expired
export type KycState = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "expired";

const KYC_MACHINE = new StateMachine<KycState>({
  draft: ["submitted"],
  submitted: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["expired"],
  // rejected / expired are terminal.
});

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
    return this.transition("submit", "submitted");
  }

  startReview(): KycStatus {
    return this.transition("start review on", "in_review");
  }

  approve(): KycStatus {
    return this.transition("approve", "approved");
  }

  reject(reason: string): KycStatus {
    this.assertTransition("reject", "rejected");
    const trimmed = reason.trim();
    if (trimmed === "") {
      throw new InvalidRejectionReasonError("a rejection must state a non-empty reason");
    }
    return new KycStatus("rejected", trimmed);
  }

  expire(): KycStatus {
    return this.transition("expire", "expired");
  }

  private transition(action: string, to: KycState): KycStatus {
    this.assertTransition(action, to);
    return new KycStatus(to);
  }

  private assertTransition(action: string, to: KycState): void {
    KYC_MACHINE.assertCanTransition(this.state, to, () => {
      throw new InvalidKycTransitionError(
        `cannot ${action} a KYC application in state "${this.state}"`,
      );
    });
  }
}
