import type { PrismaClient } from "@prisma/client";
import type {
  PasswordResetTokenRecord,
  PasswordResetTokenStore,
} from "../../application/identity/ports.js";

// Persists password-reset grants. Platform-level (pre-auth, keyed by digest),
// so it takes the RAW Prisma client — password_reset_tokens is in
// UNSCOPED_MODELS and is never tenant-scoped. Only digests are stored (T14).
export class PrismaPasswordResetTokenStore implements PasswordResetTokenStore {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: PasswordResetTokenRecord): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: record.tokenHash,
        investorId: record.investorId,
        expiresAt: record.expiresAt,
        usedAt: record.usedAt ?? null,
      },
    });
  }

  async findValid(tokenHash: string, now: Date): Promise<PasswordResetTokenRecord | undefined> {
    const row = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    });
    if (row === null) {
      return undefined;
    }
    // findValid only returns unredeemed grants (usedAt IS NULL), so usedAt is
    // always absent here; omit it rather than set it (exactOptionalPropertyTypes).
    return {
      tokenHash: row.tokenHash,
      investorId: row.investorId,
      expiresAt: row.expiresAt,
    };
  }

  async markUsed(tokenHash: string, at: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: at },
    });
  }

  async invalidateForInvestor(investorId: string, at: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { investorId, usedAt: null },
      data: { usedAt: at },
    });
  }
}
