import { randomUUID } from "node:crypto";
import type { OnboardingApplication } from "../../src/domain/onboarding/onboarding-application.js";
import type { OnboardingStep } from "../../src/domain/onboarding/onboarding-application.js";
import type {
  EvidenceContent,
  EvidenceDescriptor,
  EvidenceStore,
  OnboardingRepository,
  StepAnswers,
  StepAnswerStore,
} from "../../src/application/onboarding/ports.js";

export class InMemoryOnboardingRepository implements OnboardingRepository {
  private readonly byId = new Map<string, OnboardingApplication>();

  findById(id: string): Promise<OnboardingApplication | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByInvestor(investorId: string): Promise<OnboardingApplication | undefined> {
    return Promise.resolve(
      [...this.byId.values()].find((application) => application.investorId === investorId),
    );
  }

  save(application: OnboardingApplication): Promise<void> {
    this.byId.set(application.id, application);
    return Promise.resolve();
  }
}

// Holds the bytes in memory. Encryption is the real store's concern and is
// covered by its own integration test; use-case tests care about what is
// stored, listed and erased.
export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly byReference = new Map<string, EvidenceContent>();
  private now = new Date("2026-07-31T12:00:00Z");

  put(input: Parameters<EvidenceStore["put"]>[0]): Promise<EvidenceDescriptor> {
    const descriptor: EvidenceDescriptor = {
      reference: randomUUID(),
      investorId: input.investorId,
      step: input.step,
      filename: input.filename,
      contentType: input.contentType,
      byteSize: input.bytes.length,
      uploadedAt: this.now,
    };
    this.byReference.set(descriptor.reference, { descriptor, bytes: input.bytes });
    return Promise.resolve(descriptor);
  }

  listFor(investorId: string): Promise<EvidenceDescriptor[]> {
    return Promise.resolve(
      [...this.byReference.values()]
        .map((stored) => stored.descriptor)
        .filter((descriptor) => descriptor.investorId === investorId),
    );
  }

  fetch(reference: string): Promise<EvidenceContent | undefined> {
    return Promise.resolve(this.byReference.get(reference));
  }

  erase(reference: string): Promise<boolean> {
    return Promise.resolve(this.byReference.delete(reference));
  }
}

export class InMemoryStepAnswerStore implements StepAnswerStore {
  private readonly byInvestor = new Map<string, Partial<Record<OnboardingStep, StepAnswers>>>();

  save(investorId: string, step: OnboardingStep, answers: StepAnswers): Promise<void> {
    const existing = this.byInvestor.get(investorId) ?? {};
    this.byInvestor.set(investorId, { ...existing, [step]: { ...answers } });
    return Promise.resolve();
  }

  read(investorId: string, step: OnboardingStep): Promise<StepAnswers | undefined> {
    return Promise.resolve(this.byInvestor.get(investorId)?.[step]);
  }

  readAll(investorId: string): Promise<Partial<Record<OnboardingStep, StepAnswers>>> {
    return Promise.resolve(this.byInvestor.get(investorId) ?? {});
  }

  erase(investorId: string): Promise<boolean> {
    return Promise.resolve(this.byInvestor.delete(investorId));
  }
}
