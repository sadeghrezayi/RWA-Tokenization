import { describe, expect, it } from "vitest";
import {
  ListAllocationsAwaitingMint,
  type AwaitingMintRow,
} from "../../../src/application/reporting/allocations-awaiting-mint.js";

const CLOSED = new Date("2026-08-20T09:00:00.000Z");

const row = (overrides: Partial<AwaitingMintRow> = {}): AwaitingMintRow => ({
  offeringId: "off-1",
  assetName: "Vanak Tower",
  investorId: "inv-1",
  investorEmail: "alice@example.com",
  tokens: 60n,
  heldRial: 60_000n,
  since: CLOSED,
  claimedAt: null,
  ...overrides,
});

const reader = (rows: AwaitingMintRow[]) => ({ awaitingMint: () => Promise.resolve(rows) });

// P0-2 step 3 residue (K-34). The health probe says HOW MANY allocations hold
// money for tokens that do not exist. This says WHICH — the difference between
// knowing something is wrong and being able to do anything about it.
//
// It still releases nothing: how long to wait and who may release are the
// owner's calls. This is the evidence those decisions need.
describe("ListAllocationsAwaitingMint", () => {
  it("names who is owed what, and how much of their money is held", async () => {
    const view = await new ListAllocationsAwaitingMint(reader([row()])).execute();

    expect(view).toEqual([
      {
        offeringId: "off-1",
        assetName: "Vanak Tower",
        investorId: "inv-1",
        investorEmail: "alice@example.com",
        tokens: "60",
        heldRial: "60000",
        since: "2026-08-20T09:00:00.000Z",
        mintState: "not_minted",
      },
    ]);
  });

  it("distinguishes an UNRESOLVED attempt from one never made", async () => {
    // The two need opposite handling and must never be shown as one thing. A
    // claimed-but-unconfirmed mint may already be on the chain, so re-minting
    // could double-issue; one never attempted is safe to retry. Collapsing
    // them would invite exactly the wrong action.
    const view = await new ListAllocationsAwaitingMint(
      reader([row({ claimedAt: new Date("2026-08-20T09:05:00.000Z") })]),
    ).execute();

    expect(view[0]?.mintState).toBe("unresolved");
  });

  it("carries why the last attempt failed, so the row is not a mystery", async () => {
    const view = await new ListAllocationsAwaitingMint(
      reader([
        row({
          retry: { status: "failed", attempts: 3, lastError: "holder not registered" },
        }),
      ]),
    ).execute();

    expect(view[0]?.retry).toEqual({
      status: "failed",
      attempts: 3,
      lastError: "holder not registered",
    });
  });

  it("omits the retry block entirely when nothing was ever queued", async () => {
    // Absent is not the same as "queued with no error". An empty object here
    // would read as a retry that exists and is fine.
    const view = await new ListAllocationsAwaitingMint(reader([row()])).execute();

    expect(view[0]).not.toHaveProperty("retry");
  });

  it("puts the longest-held money first", async () => {
    // Same rule as the work queue it feeds: worked from the longest wait down.
    // Here the wait is also how long someone has been out of their money.
    const view = await new ListAllocationsAwaitingMint(
      reader([
        row({ investorId: "recent", since: new Date("2026-08-24T00:00:00.000Z") }),
        row({ investorId: "oldest", since: new Date("2026-08-01T00:00:00.000Z") }),
      ]),
    ).execute();

    expect(view.map((v) => v.investorId)).toEqual(["oldest", "recent"]);
  });

  it("renders amounts as strings, so no Rial total is rounded away", async () => {
    const view = await new ListAllocationsAwaitingMint(
      reader([row({ heldRial: 9_007_199_254_740_993n })]),
    ).execute();

    expect(view[0]?.heldRial).toBe("9007199254740993");
  });
});
