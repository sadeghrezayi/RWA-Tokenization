import type { Approval as ApprovalRow, PrismaClient } from "@prisma/client";
import { Approval } from "../../domain/approvals/approval.js";
import type {
  ApprovalAction,
  ApprovalPayload,
  ApprovalStatus,
} from "../../domain/approvals/approval.js";
import type { ApprovalRepository } from "../../application/approvals/ports.js";

// Approvals are tenant-owned, so this takes the SCOPED Prisma client. The scoped
// proxy forbids findUnique/update/upsert — use findFirst + updateMany/create.
export class PrismaApprovalRepository implements ApprovalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(approval: Approval): Promise<void> {
    const data = {
      action: approval.action,
      payload: approval.payload,
      makerId: approval.makerId,
      status: approval.status,
      checkerId: approval.checkerId ?? null,
      reason: approval.reason ?? null,
      decidedAt: approval.decidedAt ?? null,
    };
    const updated = await this.prisma.approval.updateMany({ where: { id: approval.id }, data });
    if (updated.count === 0) {
      await this.prisma.approval.create({ data: { id: approval.id, ...data } });
    }
  }

  async findById(id: string): Promise<Approval | undefined> {
    const row = await this.prisma.approval.findFirst({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByStatus(status: ApprovalStatus): Promise<Approval[]> {
    const rows = await this.prisma.approval.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }
}

const toDomain = (row: ApprovalRow): Approval =>
  Approval.restore({
    id: row.id,
    action: row.action as ApprovalAction,
    payload: row.payload as ApprovalPayload,
    makerId: row.makerId,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt,
    ...(row.checkerId !== null ? { checkerId: row.checkerId } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
    ...(row.decidedAt !== null ? { decidedAt: row.decidedAt } : {}),
  });
