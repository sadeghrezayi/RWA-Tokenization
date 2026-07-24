import type { PrismaClient } from "@prisma/client";
import type { MfaEnrollment, MfaStatus, MfaStore } from "../../application/identity/ports.js";

// Persists MFA enrollment. Platform-level (evaluated pre-session during the
// login challenge), so it takes the RAW Prisma client — mfa_enrollments is in
// UNSCOPED_MODELS and is never tenant-scoped.
export class PrismaMfaStore implements MfaStore {
  constructor(private readonly prisma: PrismaClient) {}

  async load(principalId: string): Promise<MfaEnrollment | undefined> {
    const row = await this.prisma.mfaEnrollment.findUnique({ where: { principalId } });
    if (row === null) {
      return undefined;
    }
    return {
      secret: row.secret,
      status: row.status as MfaStatus,
      recoveryCodeHashes: row.recoveryCodeHashes,
    };
  }

  async save(principalId: string, enrollment: MfaEnrollment): Promise<void> {
    const data = {
      secret: enrollment.secret,
      status: enrollment.status,
      recoveryCodeHashes: enrollment.recoveryCodeHashes,
    };
    await this.prisma.mfaEnrollment.upsert({
      where: { principalId },
      create: { principalId, ...data },
      update: data,
    });
  }

  async delete(principalId: string): Promise<void> {
    await this.prisma.mfaEnrollment.deleteMany({ where: { principalId } });
  }
}
