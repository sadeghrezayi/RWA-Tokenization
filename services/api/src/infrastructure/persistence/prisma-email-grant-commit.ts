import type { PrismaClient } from "@prisma/client";
import type {
  EmailGrantCommit,
  SingleUseTokenRecord,
  SingleUseTokenStore,
} from "../../application/identity/ports.js";
import type { NewOutboxMessage } from "../../application/outbox/ports.js";
import { PrismaOutboxStore } from "./prisma-outbox-store.js";

// 1.6b atomic producer: saves the single-use token grant and enqueues its
// delivery email in ONE transaction on the RAW client (both are platform-level
// tables). If either write fails the whole thing rolls back — the grant never
// exists without a queued email, nor the email without a grant. `tokenStoreFor`
// selects the correct grant table (reset vs. verification) bound to the tx.
export class PrismaEmailGrantCommit implements EmailGrantCommit {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenStoreFor: (tx: PrismaClient) => SingleUseTokenStore,
  ) {}

  async commit(grant: SingleUseTokenRecord, message: NewOutboxMessage): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      await this.tokenStoreFor(txClient).save(grant);
      await new PrismaOutboxStore(txClient).enqueue(message);
    });
  }
}
