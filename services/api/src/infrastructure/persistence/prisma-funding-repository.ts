import type { PrismaClient } from "@prisma/client";
import { FundingRequest } from "../../domain/funding/funding-request.js";
import type { FundingStatus } from "../../domain/funding/funding-request.js";
import type { FundingRepository } from "../../application/funding/ports.js";

export class CorruptFundingRowError extends Error {
  constructor(id: string, detail: string) {
    super(`funding request ${id} is not readable: ${detail}`);
    this.name = "CorruptFundingRowError";
  }
}

const FUNDING_STATUSES: readonly FundingStatus[] = [
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
];

const isFundingStatus = (value: string): value is FundingStatus =>
  (FUNDING_STATUSES as readonly string[]).includes(value);

interface FundingRow {
  id: string;
  investorId: string;
  amountRial: bigint;
  reference: string;
  status: string;
  requestedAt: Date;
  settledAt: Date | null;
  settledAmountRial: bigint | null;
  rejectionReason: string | null;
}

// 2.4b: persistence for the OD-6 bank-transfer flow. The row is a snapshot of
// the aggregate; every transition is decided in the domain and written back
// whole, so there is no second place where the state machine is interpreted.
export class PrismaFundingRepository implements FundingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<FundingRequest | undefined> {
    // findFirst, not findUnique: the tenant-scoped client rejects unique-input
    // operations it cannot scope.
    const row = await this.prisma.fundingRequest.findFirst({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByInvestor(investorId: string): Promise<FundingRequest[]> {
    const rows = await this.prisma.fundingRequest.findMany({
      where: { investorId },
      // Newest first, with a stable tiebreak: two requests can share a
      // millisecond, and an arbitrary order would make the list flicker.
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toDomain);
  }

  async findPending(): Promise<FundingRequest[]> {
    const rows = await this.prisma.fundingRequest.findMany({
      where: { status: "pending" },
      // Oldest first: treasury works the queue from the longest-waiting.
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async save(request: FundingRequest): Promise<void> {
    const state = {
      status: request.status,
      settledAt: request.settledAt ?? null,
      settledAmountRial: request.settledAmountRial ?? null,
      rejectionReason: request.rejectionReason ?? null,
    };

    // updateMany + create rather than upsert: the tenant-scoped client cannot
    // scope a unique-input upsert. The update is attempted first so a settled
    // request is never duplicated.
    const { count } = await this.prisma.fundingRequest.updateMany({
      where: { id: request.id },
      data: state,
    });
    if (count > 0) {
      return;
    }

    await this.prisma.fundingRequest.create({
      data: {
        id: request.id,
        investorId: request.investorId,
        amountRial: request.amountRial,
        reference: request.reference,
        requestedAt: request.requestedAt,
        ...state,
      },
    });
  }
}

const toDomain = (row: FundingRow): FundingRequest => {
  if (!isFundingStatus(row.status)) {
    // Written only by this adapter from a typed value, so an unrecognized
    // status means the data was altered underneath us.
    throw new CorruptFundingRowError(row.id, `unknown status "${row.status}"`);
  }
  return FundingRequest.restore({
    id: row.id,
    investorId: row.investorId,
    amountRial: row.amountRial,
    reference: row.reference,
    status: row.status,
    requestedAt: row.requestedAt,
    // exactOptionalPropertyTypes: omit rather than set undefined.
    ...(row.settledAt !== null ? { settledAt: row.settledAt } : {}),
    ...(row.settledAmountRial !== null ? { settledAmountRial: row.settledAmountRial } : {}),
    ...(row.rejectionReason !== null ? { rejectionReason: row.rejectionReason } : {}),
  });
};
