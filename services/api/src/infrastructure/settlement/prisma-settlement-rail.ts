import type { PrismaClient } from "@prisma/client";
import { InsufficientFundsError } from "../../application/offerings/errors.js";
import type { SettlementRail } from "../../application/offerings/ports.js";
import type { DistributionLedger } from "../../application/distributions/ports.js";

// D3: the off-chain Rial ledger. Every movement is a guarded, atomic
// balance/held update plus an append-only ledger entry (NFR-2). The guard in
// the WHERE clause makes concurrent over-spends impossible.
export class PrismaSettlementRail implements SettlementRail, DistributionLedger {
  constructor(private readonly prisma: PrismaClient) {}

  // Operator-recorded bank deposit (the pilot's simulated bank rail).
  async credit(investorId: string, amountRial: bigint, actor: string): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerAccount.upsert({
        where: { investorId },
        create: { investorId, balance: amountRial },
        update: { balance: { increment: amountRial } },
      });
      await tx.ledgerEntry.create({
        data: { investorId, kind: "credit", amountRial, actor },
      });
    });
  }

  async hold(investorId: string, amountRial: bigint): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ledgerAccount.updateMany({
        where: { investorId, balance: { gte: amountRial } },
        data: { balance: { decrement: amountRial }, held: { increment: amountRial } },
      });
      if (updated.count === 0) {
        throw new InsufficientFundsError();
      }
      await tx.ledgerEntry.create({
        data: { investorId, kind: "hold", amountRial, actor: investorId },
      });
    });
  }

  async release(investorId: string, amountRial: bigint): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ledgerAccount.updateMany({
        where: { investorId, held: { gte: amountRial } },
        data: { held: { decrement: amountRial }, balance: { increment: amountRial } },
      });
      if (updated.count === 0) {
        throw new Error(`release exceeds held funds for investor ${investorId}`);
      }
      await tx.ledgerEntry.create({
        data: { investorId, kind: "release", amountRial, actor: "platform" },
      });
    });
  }

  async capture(investorId: string, amountRial: bigint): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ledgerAccount.updateMany({
        where: { investorId, held: { gte: amountRial } },
        data: { held: { decrement: amountRial } },
      });
      if (updated.count === 0) {
        throw new Error(`capture exceeds held funds for investor ${investorId}`);
      }
      await tx.ledgerEntry.create({
        data: { investorId, kind: "capture", amountRial, actor: "platform" },
      });
    });
  }

  // FR-YD-1 / D5b: a distribution payout credits the balance directly, with a
  // distinct ledger-entry kind for the audit trail.
  async payout(investorId: string, amountRial: bigint): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerAccount.upsert({
        where: { investorId },
        create: { investorId, balance: amountRial },
        update: { balance: { increment: amountRial } },
      });
      await tx.ledgerEntry.create({
        data: { investorId, kind: "distribution", amountRial, actor: "platform" },
      });
    });
  }

  // FR-TR-2: a fulfilled redemption credits the balance with its own
  // ledger-entry kind so the audit trail separates income from redemptions.
  async payoutRedemption(investorId: string, amountRial: bigint): Promise<void> {
    this.assertPositive(amountRial);
    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerAccount.upsert({
        where: { investorId },
        create: { investorId, balance: amountRial },
        update: { balance: { increment: amountRial } },
      });
      await tx.ledgerEntry.create({
        data: { investorId, kind: "redemption", amountRial, actor: "platform" },
      });
    });
  }

  async balanceOf(investorId: string): Promise<{ balanceRial: bigint; heldRial: bigint }> {
    const account = await this.prisma.ledgerAccount.findUnique({ where: { investorId } });
    return { balanceRial: account?.balance ?? 0n, heldRial: account?.held ?? 0n };
  }

  private assertPositive(amountRial: bigint): void {
    if (amountRial <= 0n) {
      throw new Error("ledger movements must be positive amounts");
    }
  }
}
