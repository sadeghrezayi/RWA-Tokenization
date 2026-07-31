import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { InvalidOnboardingTransitionError } from "../../domain/onboarding/errors.js";
import { EvidenceTooLargeError, UnsupportedEvidenceTypeError } from "./errors.js";
import { loadApplication } from "./load-application.js";
import type { EvidenceDescriptor, EvidenceStore, OnboardingRepository } from "./ports.js";

// Engineering defaults, flagged: what an officer can actually open, and a size
// a phone photo comfortably fits under. Both are candidates for configuration
// once a real document policy exists.
export const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export class UploadEvidence {
  constructor(
    private readonly applications: OnboardingRepository,
    private readonly evidence: EvidenceStore,
  ) {}

  async execute(input: {
    investorId: string;
    step: OnboardingStep;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<EvidenceDescriptor> {
    const application = await loadApplication(this.applications, input.investorId);
    if (application.status === "submitted") {
      throw new InvalidOnboardingTransitionError(
        "an application under review cannot be edited; ask the reviewer for changes first",
      );
    }

    if (!(ALLOWED_EVIDENCE_TYPES as readonly string[]).includes(input.contentType)) {
      throw new UnsupportedEvidenceTypeError(
        `a document must be one of ${ALLOWED_EVIDENCE_TYPES.join(", ")}`,
      );
    }
    if (input.bytes.length === 0) {
      // An empty upload is almost always a failed file picker, and it would
      // satisfy the evidence step without evidence.
      throw new UnsupportedEvidenceTypeError("the uploaded document is empty");
    }
    if (input.bytes.length > MAX_EVIDENCE_BYTES) {
      throw new EvidenceTooLargeError(MAX_EVIDENCE_BYTES);
    }

    return this.evidence.put({
      investorId: input.investorId,
      step: input.step,
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
    });
  }
}
