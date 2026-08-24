import type { PrismaClient } from "@prisma/client";
import type {
  AllocationKey,
  AllocationMintLog,
  AllocationMintState,
} from "../../application/offerings/ports.js";
import type { IdGenerator } from "../../application/identity/ports.js";

// Postgres error for a unique-constraint violation. Matched explicitly so a
// lost race is distinguished from a real database fault — swallowing every
// error here would hide an outage as "someone else claimed it".
const UNIQUE_VIOLATION = "P2002";

// P0-2 step 1. The idempotency guarantee is the UNIQUE INDEX on
// (offering_id, investor_id), not the read-then-write in the use case: two
// concurrent deliveries can both read "unminted", and only the index stops
// both of them minting.
export class PrismaAllocationMintLog implements AllocationMintLog {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
  ) {}

  async stateOf(key: AllocationKey): Promise<AllocationMintState> {
    const row = await this.prisma.allocationMint.findFirst({
      where: { offeringId: key.offeringId, investorId: key.investorId },
    });
    if (row === null) {
      return "unminted";
    }
    // Claimed but never confirmed: the chain's answer is unknown.
    return row.confirmedAt === null ? "unresolved" : "minted";
  }

  async claim(key: AllocationKey, tokens: bigint): Promise<boolean> {
    try {
      await this.prisma.allocationMint.create({
        data: {
          id: this.ids.nextId(),
          offeringId: key.offeringId,
          investorId: key.investorId,
          // Stored as text: token counts are bigint and Postgres numerics
          // would round the large ones, which is the whole reason the rest of
          // this codebase keeps amounts as strings.
          tokens: String(tokens),
        },
      });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        // Another delivery got there first. Not an error — the point.
        return false;
      }
      throw error;
    }
  }

  async confirm(key: AllocationKey): Promise<void> {
    await this.prisma.allocationMint.updateMany({
      where: { offeringId: key.offeringId, investorId: key.investorId },
      data: { confirmedAt: new Date() },
    });
  }
}
