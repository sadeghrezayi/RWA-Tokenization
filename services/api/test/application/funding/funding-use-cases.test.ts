import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InvalidFundingTransitionError } from "../../../src/domain/funding/errors.js";
import { FundingRequestNotFoundError } from "../../../src/application/funding/errors.js";
import { RequestFunding } from "../../../src/application/funding/request-funding.js";
import { ConfirmFunding } from "../../../src/application/funding/confirm-funding.js";
import { RejectFunding } from "../../../src/application/funding/reject-funding.js";
import { CancelFunding } from "../../../src/application/funding/cancel-funding.js";
import {
  ListMyFunding,
  ListPendingFunding,
} from "../../../src/application/funding/list-funding.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import { InMemoryFundingRepository, RecordingLedgerCredit } from "../../fakes/funding-fakes.js";

const NOW = new Date("2026-08-02T09:00:00Z");
const LATER = new Date("2026-08-03T09:00:00Z");

// Bank details are deployment configuration, not something this codebase knows.
const INSTRUCTIONS = {
  bankName: "Test Bank",
  accountHolder: "Tokenization Platform LLC",
  accountNumber: "IR000000000000000000000000",
  notice: "Quote the reference exactly.",
};

let investors: InMemoryInvestorRepository;
let funding: InMemoryFundingRepository;
let credit: RecordingLedgerCredit;
let request: RequestFunding;
let confirm: ConfirmFunding;
let reject: RejectFunding;
let cancel: CancelFunding;
let listMine: ListMyFunding;
let listPending: ListPendingFunding;

let nextId = 0;
// Advances on every read, so "newest first" is asserted against requests that
// genuinely differ in time rather than against a tiebreak.
let tick = 0;
const clock = { now: () => new Date(NOW.getTime() + (tick += 1000)) };

beforeEach(async () => {
  nextId = 0;
  tick = 0;
  investors = new InMemoryInvestorRepository();
  funding = new InMemoryFundingRepository();
  credit = new RecordingLedgerCredit();
  const ids = { nextId: () => `fund-${String(++nextId)}` };

  request = new RequestFunding(investors, funding, ids, clock, INSTRUCTIONS);
  confirm = new ConfirmFunding(funding, credit, { now: () => LATER });
  reject = new RejectFunding(funding, { now: () => LATER });
  cancel = new CancelFunding(funding, { now: () => LATER });
  listMine = new ListMyFunding(funding);
  listPending = new ListPendingFunding(funding, investors);

  await investors.save(
    Investor.register("inv-1", EmailAddress.of("holder@example.com"), PasswordHash.of("hash")),
  );
});

describe("RequestFunding", () => {
  it("hands back the reference and where to send the money", async () => {
    const view = await request.execute({ investorId: "inv-1", amountRial: 50_000_000n });

    expect(view.request.status).toBe("pending");
    expect(view.request.amountRial).toBe("50000000");
    expect(view.request.reference).toMatch(/^TP-/);
    expect(view.instructions).toEqual(INSTRUCTIONS);
  });

  it("gives every request its own reference", async () => {
    const first = await request.execute({ investorId: "inv-1", amountRial: 1_000n });
    const second = await request.execute({ investorId: "inv-1", amountRial: 2_000n });

    // Two requests sharing a reference would make a bank line unattributable.
    expect(first.request.reference).not.toBe(second.request.reference);
  });

  it("refuses an amount that is not positive", async () => {
    await expect(request.execute({ investorId: "inv-1", amountRial: 0n })).rejects.toThrow();
  });

  it("refuses to open a request for an investor who does not exist", async () => {
    await expect(request.execute({ investorId: "ghost", amountRial: 1_000n })).rejects.toThrow();
  });
});

describe("ConfirmFunding", () => {
  const openOne = async () =>
    (await request.execute({ investorId: "inv-1", amountRial: 50_000_000n })).request.id;

  it("credits the ledger with what actually arrived, not what was promised", async () => {
    const id = await openOne();

    const result = await confirm.execute({
      requestId: id,
      receivedRial: 49_950_000n,
      officerId: "officer-1",
    });

    expect(result.request.status).toBe("confirmed");
    expect(result.request.settledAmountRial).toBe("49950000");
    expect(credit.calls).toEqual([
      { investorId: "inv-1", amountRial: 49_950_000n, makerId: "officer-1" },
    ]);
  });

  it("reports when the credit is parked for a second approval", async () => {
    // Above the maker-checker threshold the money is not in the account yet —
    // saying "confirmed" without that would misstate the balance.
    const id = await openOne();
    credit.nextResult = { status: "pending_approval", approvalId: "apr-9" };

    const result = await confirm.execute({
      requestId: id,
      receivedRial: 50_000_000n,
      officerId: "officer-1",
    });

    expect(result.creditStatus).toEqual({ status: "pending_approval", approvalId: "apr-9" });
  });

  it("cannot confirm the same deposit twice", async () => {
    const id = await openOne();
    await confirm.execute({ requestId: id, receivedRial: 10n, officerId: "officer-1" });

    await expect(
      confirm.execute({ requestId: id, receivedRial: 10n, officerId: "officer-1" }),
    ).rejects.toThrow(InvalidFundingTransitionError);
    expect(credit.calls).toHaveLength(1);
  });

  it("does not confirm a request that does not exist", async () => {
    await expect(
      confirm.execute({ requestId: "nope", receivedRial: 1n, officerId: "officer-1" }),
    ).rejects.toThrow(FundingRequestNotFoundError);
  });

  it("leaves the request pending if the credit fails", async () => {
    // Marking it confirmed while no money reached the ledger would strand the
    // investor: treasury sees it settled, the balance says otherwise.
    const id = await openOne();
    credit.failNext = new Error("ledger unavailable");

    await expect(
      confirm.execute({ requestId: id, receivedRial: 10n, officerId: "officer-1" }),
    ).rejects.toThrow("ledger unavailable");

    const stored = await funding.findById(id);
    expect(stored?.status).toBe("pending");
  });
});

describe("RejectFunding", () => {
  it("records the reason and credits nothing", async () => {
    const { request: opened } = await request.execute({
      investorId: "inv-1",
      amountRial: 1_000n,
    });

    const view = await reject.execute({
      requestId: opened.id,
      reason: "no matching bank credit",
      officerId: "officer-1",
    });

    expect(view.status).toBe("rejected");
    expect(view.rejectionReason).toBe("no matching bank credit");
    expect(credit.calls).toEqual([]);
  });
});

describe("CancelFunding", () => {
  it("lets the investor withdraw their own pending request", async () => {
    const { request: opened } = await request.execute({
      investorId: "inv-1",
      amountRial: 1_000n,
    });

    const view = await cancel.execute({ requestId: opened.id, investorId: "inv-1" });
    expect(view.status).toBe("cancelled");
  });

  it("will not let one investor cancel another's request", async () => {
    const { request: opened } = await request.execute({
      investorId: "inv-1",
      amountRial: 1_000n,
    });

    // Reported as absent, not forbidden: an outsider learns nothing.
    await expect(cancel.execute({ requestId: opened.id, investorId: "inv-2" })).rejects.toThrow(
      FundingRequestNotFoundError,
    );
  });
});

describe("listing", () => {
  it("shows an investor their own requests, newest first", async () => {
    const first = await request.execute({ investorId: "inv-1", amountRial: 1_000n });
    const second = await request.execute({ investorId: "inv-1", amountRial: 2_000n });
    const stored = await funding.findById(first.request.id);
    if (!stored) throw new Error("expected the first request to be stored");
    await funding.save(stored.confirm({ receivedRial: 1_000n, now: LATER }));

    const mine = await listMine.execute({ investorId: "inv-1" });

    expect(mine.map((item) => item.id)).toEqual([second.request.id, first.request.id]);
    expect(mine.find((item) => item.id === first.request.id)?.status).toBe("confirmed");
  });

  it("gives treasury the pending queue with a human label, oldest first", async () => {
    await request.execute({ investorId: "inv-1", amountRial: 1_000n });

    const queue = await listPending.execute();

    expect(queue).toHaveLength(1);
    // A UUID tells a treasury officer nothing while they read a bank statement.
    expect(queue[0]?.investorEmail).toBe("holder@example.com");
    expect(queue[0]?.reference).toMatch(/^TP-/);
  });

  it("drops settled requests out of the treasury queue", async () => {
    const { request: opened } = await request.execute({
      investorId: "inv-1",
      amountRial: 1_000n,
    });
    await confirm.execute({ requestId: opened.id, receivedRial: 1_000n, officerId: "officer-1" });

    expect(await listPending.execute()).toEqual([]);
  });
});
