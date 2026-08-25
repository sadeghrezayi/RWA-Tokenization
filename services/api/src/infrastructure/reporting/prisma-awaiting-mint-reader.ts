import type { PrismaClient } from "@prisma/client";
import type {
  AwaitingMintReader,
  AwaitingMintRow,
} from "../../application/reporting/allocations-awaiting-mint.js";
import { MINT_ALLOCATION_TYPE } from "../../application/offerings/settle-with-retry.js";

// One database row, before the use case shapes it for the wire.
interface Row {
  offering_id: string;
  asset_name: string;
  investor_id: string;
  investor_email: string;
  tokens: bigint;
  held_rial: bigint;
  since: Date;
  claimed_at: Date | null;
  retry_status: string | null;
  retry_attempts: number | null;
  retry_last_error: string | null;
}

// P0-2 step 3 residue (K-34): which allocations hold money for tokens that do
// not exist, and why each one is stuck.
//
// Raw SQL for the same reason the health count is: the exclusion is on a
// COMPOSITE key (offering, investor) that `notIn` cannot express. The retry is
// a LATERAL join because a redelivered allocation can have more than one
// message and only the newest explains the current state.
export class PrismaAwaitingMintReader implements AwaitingMintReader {
  constructor(private readonly prisma: PrismaClient) {}

  async awaitingMint(): Promise<AwaitingMintRow[]> {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT a.offering_id,
             ast.name        AS asset_name,
             a.investor_id,
             i.email         AS investor_email,
             a.allocated     AS tokens,
             a.cost_rial     AS held_rial,
             a.created_at    AS since,
             m.claimed_at    AS claimed_at,
             ob.status       AS retry_status,
             ob.attempts     AS retry_attempts,
             ob.last_error   AS retry_last_error
      FROM offering_allocations a
      JOIN offerings  o   ON o.id   = a.offering_id
      JOIN assets     ast ON ast.id = o.asset_id
      JOIN investors  i   ON i.id   = a.investor_id
      -- Confirmed mints are excluded below, so this can only be the
      -- unconfirmed claim: exactly the unresolved case.
      LEFT JOIN allocation_mints m
        ON m.offering_id = a.offering_id AND m.investor_id = a.investor_id
      LEFT JOIN LATERAL (
        SELECT status, attempts, last_error
        FROM outbox_messages
        WHERE type = ${MINT_ALLOCATION_TYPE}
          AND payload->>'offeringId' = a.offering_id
          AND payload->>'investorId' = a.investor_id
        ORDER BY created_at DESC
        LIMIT 1
      ) ob ON TRUE
      WHERE a.allocated > 0
        AND NOT EXISTS (
          SELECT 1 FROM allocation_mints c
          WHERE c.offering_id = a.offering_id
            AND c.investor_id = a.investor_id
            AND c.confirmed_at IS NOT NULL
        )
    `;

    return rows.map((row) => ({
      offeringId: row.offering_id,
      assetName: row.asset_name,
      investorId: row.investor_id,
      investorEmail: row.investor_email,
      tokens: row.tokens,
      heldRial: row.held_rial,
      since: row.since,
      claimedAt: row.claimed_at,
      // Omitted rather than half-filled: a retry block with a null status would
      // read as a retry that exists and is fine.
      ...(row.retry_status === null
        ? {}
        : {
            retry: {
              status: row.retry_status,
              attempts: row.retry_attempts ?? 0,
              ...(row.retry_last_error === null ? {} : { lastError: row.retry_last_error }),
            },
          }),
    }));
  }
}
