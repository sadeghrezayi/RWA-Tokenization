import type { OnboardingApplication } from "../../domain/onboarding/onboarding-application.js";
import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";

export interface OnboardingRepository {
  findById(id: string): Promise<OnboardingApplication | undefined>;
  findByInvestor(investorId: string): Promise<OnboardingApplication | undefined>;
  save(application: OnboardingApplication): Promise<void>;
}

// What is known about a stored document WITHOUT decrypting it. Deliberately
// excludes the content: listing an applicant's evidence must not require
// decrypting personal data.
export interface EvidenceDescriptor {
  reference: string;
  investorId: string;
  step: OnboardingStep;
  filename: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
}

export interface EvidenceContent {
  descriptor: EvidenceDescriptor;
  bytes: Buffer;
}

// 2.3b: private storage for identity evidence (recorded decision: NOT IPFS).
//
// Identity documents are personal data. IPFS is content-addressed and
// effectively permanent — anyone holding the CID could fetch a passport scan,
// and erasure would be impossible. Hence a private store, encrypted at rest,
// with a real `delete`: the erasure capability is the whole point of the choice
// and is part of the port for that reason.
export interface EvidenceStore {
  put(input: {
    investorId: string;
    step: OnboardingStep;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<EvidenceDescriptor>;

  // Metadata only — no decryption, so a listing screen never handles content.
  listFor(investorId: string): Promise<EvidenceDescriptor[]>;

  // Decrypts. Callers must already have established that the requester is
  // entitled to see this applicant's documents.
  fetch(reference: string): Promise<EvidenceContent | undefined>;

  // Erasure. Returns whether anything was removed so callers can report
  // honestly rather than assuming.
  erase(reference: string): Promise<boolean>;
}
