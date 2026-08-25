// P0-2 step 3 residue (K-34). Capture follows the mint now, so an allocation
// whose tokens were never issued is one whose investor is still holding the
// cost in escrow. `allocationsAwaitingMint` on the health probe says HOW MANY;
// this says WHICH, which is the difference between knowing something is wrong
// and being able to act on it.
//
// It releases nothing. How long to wait before releasing, and who is allowed
// to, are the owner's decisions — this is the evidence they need.

// What the reader returns: amounts as bigint and times as Date, because that is
// what the database holds. Shaping for the wire happens in the use case, once.
export interface AwaitingMintRow {
  offeringId: string;
  assetName: string;
  investorId: string;
  investorEmail: string;
  tokens: bigint;
  heldRial: bigint;
  // When the money started being held — the offering's close.
  since: Date;
  // NULL when no mint was ever claimed. Non-null with no confirmation is the
  // `unresolved` case: the chain's answer is unknown.
  claimedAt: Date | null;
  retry?: { status: string; attempts: number; lastError?: string };
}

export interface AwaitingMintReader {
  awaitingMint(): Promise<AwaitingMintRow[]>;
}

// `unresolved` may already be on the chain, so retrying it risks double-issuing;
// `not_minted` was never attempted and is safe to retry. Opposite handling, so
// they are never collapsed into one status.
export type AwaitingMintState = "unresolved" | "not_minted";

export interface AllocationAwaitingMintView {
  offeringId: string;
  assetName: string;
  investorId: string;
  investorEmail: string;
  // Strings on the wire: JSON has no bigint, and a Number() would drop the low
  // digits of a large Rial escrow.
  tokens: string;
  heldRial: string;
  since: string;
  mintState: AwaitingMintState;
  retry?: { status: string; attempts: number; lastError?: string };
}

export class ListAllocationsAwaitingMint {
  constructor(private readonly reader: AwaitingMintReader) {}

  async execute(): Promise<AllocationAwaitingMintView[]> {
    const rows = await this.reader.awaitingMint();
    return (
      rows
        // Longest-held money first: the same rule the work queue is worked by,
        // and here the wait is also how long someone has been out of their money.
        .sort((a, b) => a.since.getTime() - b.since.getTime())
        .map((row) => ({
          offeringId: row.offeringId,
          assetName: row.assetName,
          investorId: row.investorId,
          investorEmail: row.investorEmail,
          tokens: String(row.tokens),
          heldRial: String(row.heldRial),
          since: row.since.toISOString(),
          mintState: row.claimedAt === null ? ("not_minted" as const) : ("unresolved" as const),
          // Spread, not `retry: row.retry` — assigning undefined to an optional
          // property is a type error under exactOptionalPropertyTypes, and an
          // empty object would read as a retry that exists and is fine.
          ...(row.retry === undefined ? {} : { retry: row.retry }),
        }))
    );
  }
}
