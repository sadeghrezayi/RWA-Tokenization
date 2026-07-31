import type { Prisma, PrismaClient } from "@prisma/client";
import type { ChangeRequest } from "../../domain/onboarding/onboarding-application.js";
import {
  OnboardingApplication,
  isApplicantKind,
  isOnboardingStatus,
  isOnboardingStep,
} from "../../domain/onboarding/onboarding-application.js";
import type { OnboardingRepository } from "../../application/onboarding/ports.js";

export class CorruptOnboardingRowError extends Error {
  constructor(id: string, detail: string) {
    super(`onboarding application ${id} is not readable: ${detail}`);
    this.name = "CorruptOnboardingRowError";
  }
}

interface OnboardingRow {
  id: string;
  investorId: string;
  kind: string;
  status: string;
  completedSteps: string[];
  changeRequests: unknown;
  startedAt: Date;
  submittedAt: Date | null;
}

// 2.3b: persistence for the onboarding lifecycle. The row is a snapshot of the
// aggregate; every transition is decided in the domain and written back whole,
// so there is no second place where the state machine is (mis)interpreted.
export class PrismaOnboardingRepository implements OnboardingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<OnboardingApplication | undefined> {
    // findFirst, not findUnique: the tenant-scoped client rejects unique-input
    // operations it cannot scope.
    const row = await this.prisma.onboardingApplication.findFirst({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByInvestor(investorId: string): Promise<OnboardingApplication | undefined> {
    const row = await this.prisma.onboardingApplication.findFirst({ where: { investorId } });
    return row ? this.toDomain(row) : undefined;
  }

  async save(application: OnboardingApplication): Promise<void> {
    const state = {
      status: application.status,
      completedSteps: application.completedSteps(),
      // Prisma types Json columns structurally; a domain array satisfies the
      // JSON contract but not that structural type, hence the cast.
      changeRequests: [...application.changeRequests] as unknown as Prisma.InputJsonValue,
      submittedAt: application.submittedAt ?? null,
    };

    // updateMany + create rather than upsert: the tenant-scoped client cannot
    // scope a unique-input upsert. The update is attempted first so an existing
    // application is never duplicated.
    const { count } = await this.prisma.onboardingApplication.updateMany({
      where: { id: application.id },
      data: state,
    });
    if (count > 0) {
      return;
    }

    await this.prisma.onboardingApplication.create({
      data: {
        id: application.id,
        investorId: application.investorId,
        kind: application.kind,
        startedAt: application.startedAt,
        ...state,
      },
    });
  }

  private toDomain(row: OnboardingRow): OnboardingApplication {
    if (!isApplicantKind(row.kind)) {
      throw new CorruptOnboardingRowError(row.id, `unknown applicant kind "${row.kind}"`);
    }
    if (!isOnboardingStatus(row.status)) {
      throw new CorruptOnboardingRowError(row.id, `unknown status "${row.status}"`);
    }
    return OnboardingApplication.restore({
      id: row.id,
      investorId: row.investorId,
      kind: row.kind,
      status: row.status,
      completed: row.completedSteps.filter(isOnboardingStep),
      changeRequests: this.toChangeRequests(row),
      startedAt: row.startedAt,
      // exactOptionalPropertyTypes: omit rather than set undefined.
      ...(row.submittedAt !== null ? { submittedAt: row.submittedAt } : {}),
    });
  }

  private toChangeRequests(row: OnboardingRow): ChangeRequest[] {
    if (!Array.isArray(row.changeRequests)) {
      throw new CorruptOnboardingRowError(row.id, "change requests are not a list");
    }
    return row.changeRequests.map((entry) => {
      const candidate = entry as { step?: unknown; reason?: unknown };
      if (typeof candidate.step !== "string" || !isOnboardingStep(candidate.step)) {
        throw new CorruptOnboardingRowError(row.id, "a change request names an unknown step");
      }
      if (typeof candidate.reason !== "string") {
        // A reason-less change request would leave an applicant guessing.
        throw new CorruptOnboardingRowError(row.id, "a change request has no reason");
      }
      return { step: candidate.step, reason: candidate.reason };
    });
  }
}
