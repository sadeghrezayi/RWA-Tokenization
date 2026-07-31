import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { OnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import { isOnboardingStep } from "../../domain/onboarding/onboarding-application.js";
import type { Clock } from "../../application/offerings/ports.js";
import type { StepAnswers, StepAnswerStore } from "../../application/onboarding/ports.js";

export class CorruptAnswerRowError extends Error {
  constructor(detail: string) {
    super(`stored onboarding answers are not readable: ${detail}`);
    this.name = "CorruptAnswerRowError";
  }
}

// Prisma types a Bytes column as Uint8Array<ArrayBuffer>; a Node Buffer is a
// Uint8Array over ArrayBufferLike, so the bytes are copied into a plain one.
const toBytes = (buffer: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(buffer);

// 2.3e: the applicant's typed answers, sealed at rest.
//
// These are personal data — a national ID and a bank account, not just a
// progress flag — so they get exactly what the uploaded documents get: AES-GCM
// encryption, tenant scoping, and an erase() that really removes them. One row
// per (investor, step) so re-answering one step never rewrites the others.
export class PrismaStepAnswerStore implements StepAnswerStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: {
      encrypt(plaintext: Buffer): Buffer;
      decrypt(sealed: Buffer): Buffer;
    },
    private readonly clock: Clock,
  ) {}

  async save(investorId: string, step: OnboardingStep, answers: StepAnswers): Promise<void> {
    const content = toBytes(this.cipher.encrypt(Buffer.from(JSON.stringify(answers), "utf8")));
    const updatedAt = this.clock.now();

    // updateMany + create rather than upsert: the tenant-scoped client cannot
    // scope a unique-input upsert.
    const { count } = await this.prisma.onboardingAnswer.updateMany({
      where: { investorId, step },
      data: { content, updatedAt },
    });
    if (count > 0) {
      return;
    }
    await this.prisma.onboardingAnswer.create({
      data: { id: randomUUID(), investorId, step, content, updatedAt },
    });
  }

  async read(investorId: string, step: OnboardingStep): Promise<StepAnswers | undefined> {
    const row = await this.prisma.onboardingAnswer.findFirst({ where: { investorId, step } });
    return row ? this.decode(Buffer.from(row.content)) : undefined;
  }

  async readAll(investorId: string): Promise<Partial<Record<OnboardingStep, StepAnswers>>> {
    const rows = await this.prisma.onboardingAnswer.findMany({ where: { investorId } });
    const all: Partial<Record<OnboardingStep, StepAnswers>> = {};
    for (const row of rows) {
      if (!isOnboardingStep(row.step)) {
        throw new CorruptAnswerRowError(`unknown step "${row.step}"`);
      }
      all[row.step] = this.decode(Buffer.from(row.content));
    }
    return all;
  }

  async erase(investorId: string): Promise<boolean> {
    const { count } = await this.prisma.onboardingAnswer.deleteMany({ where: { investorId } });
    return count > 0;
  }

  private decode(sealed: Buffer): StepAnswers {
    // decrypt() throws if the authentication tag does not verify — answers
    // altered at rest surface as an error, never as content a reviewer trusts.
    const parsed: unknown = JSON.parse(this.cipher.decrypt(sealed).toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new CorruptAnswerRowError("the stored value is not an answer set");
    }
    const answers: StepAnswers = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        throw new CorruptAnswerRowError(`the answer to "${name}" is not text`);
      }
      answers[name] = value;
    }
    return answers;
  }
}
