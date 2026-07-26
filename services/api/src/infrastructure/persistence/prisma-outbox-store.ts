import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  NewOutboxMessage,
  OutboxMessage,
  OutboxStore,
} from "../../application/outbox/ports.js";

// Seconds a claimed message is hidden from other drainers. If a drain crashes
// mid-handle the row re-surfaces after this window and is retried (at-least-once).
const VISIBILITY_SECONDS = 30;

interface ClaimedRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  availableAt: Date;
  lastError: string | null;
  createdAt: Date;
}

// 1.6b outbox adapter. Constructed with a raw (or transaction-bound) client:
// enqueue runs inside a producer's transaction for atomicity; the drainer uses
// the raw client for claim/settle. The table is platform-level (UNSCOPED_MODELS).
export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(message: NewOutboxMessage): Promise<void> {
    await this.prisma.outboxMessage.create({
      data: {
        id: randomUUID(),
        type: message.type,
        payload: message.payload as Prisma.InputJsonValue,
      },
    });
  }

  // Atomically claim due messages with FOR UPDATE SKIP LOCKED: increments
  // attempts and hides each row for the visibility window, all in one statement
  // so concurrent drainers never take the same row.
  async claimDue(now: Date, limit: number): Promise<OutboxMessage[]> {
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
      UPDATE "outbox_messages" AS m
      SET "attempts" = m."attempts" + 1,
          "available_at" = ${now} + (${VISIBILITY_SECONDS} * interval '1 second'),
          "updated_at" = now()
      WHERE m."id" IN (
        SELECT c."id" FROM "outbox_messages" AS c
        WHERE c."status" = 'pending' AND c."available_at" <= ${now}
        ORDER BY c."available_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING m."id", m."type", m."payload", m."status", m."attempts",
                m."available_at" AS "availableAt", m."last_error" AS "lastError",
                m."created_at" AS "createdAt";
    `);
    return rows.map((row) => this.toMessage(row));
  }

  async markSent(id: string, at: Date): Promise<void> {
    // Clear the payload: delivered messages carry secrets (reset/verification
    // tokens) that must not linger at rest. `at` is the settle time; the row is
    // terminal (status filter excludes it) so availableAt is inert hereafter.
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: "sent", payload: {}, availableAt: at },
    });
  }

  async reschedule(id: string, availableAt: Date, error: string): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: "pending", availableAt, lastError: error },
    });
  }

  async markDead(id: string, at: Date, error: string): Promise<void> {
    // Same secret-hygiene as markSent; keep lastError for diagnosis.
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: "dead", payload: {}, lastError: error, availableAt: at },
    });
  }

  private toMessage(row: ClaimedRow): OutboxMessage {
    const base: OutboxMessage = {
      id: row.id,
      type: row.type,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: row.status as OutboxMessage["status"],
      attempts: row.attempts,
      availableAt: row.availableAt,
      createdAt: row.createdAt,
    };
    return row.lastError === null ? base : { ...base, lastError: row.lastError };
  }
}
