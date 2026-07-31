import { EvidenceNotFoundError } from "./errors.js";
import type { EvidenceContent, EvidenceStore } from "./ports.js";

// Reading a stored document. `investorId` narrows the request to that
// applicant's own documents — the caller passes it for a self-service request
// and omits it for a reviewer who is entitled to the whole queue.
export class DownloadEvidence {
  constructor(private readonly evidence: EvidenceStore) {}

  async execute(input: { reference: string; investorId?: string }): Promise<EvidenceContent> {
    const content = await this.evidence.fetch(input.reference);
    // One answer for "does not exist" and "not yours", so nobody can probe for
    // other applicants' documents.
    if (!content || (input.investorId && content.descriptor.investorId !== input.investorId)) {
      throw new EvidenceNotFoundError(input.reference);
    }
    return content;
  }
}
