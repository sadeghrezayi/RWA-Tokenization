import { describe, expect, it } from "vitest";
import { FundingRequest } from "../../../src/domain/funding/funding-request.js";
import {
  InvalidFundingAmountError,
  InvalidFundingReferenceError,
  InvalidFundingTransitionError,
  MissingRejectionReasonError,
} from "../../../src/domain/funding/errors.js";

const NOW = new Date("2026-08-02T09:00:00Z");
const LATER = new Date("2026-08-03T09:00:00Z");

const requested = (amountRial = 50_000_000n) =>
  FundingRequest.open({
    id: "fund-1",
    investorId: "inv-1",
    amountRial,
    reference: "TP-4F9K2A",
    now: NOW,
  });

describe("FundingRequest — opening", () => {
  it("starts pending, with the reference the investor must quote", () => {
    const request = requested();

    expect(request.status).toBe("pending");
    expect(request.reference).toBe("TP-4F9K2A");
    expect(request.amountRial).toBe(50_000_000n);
    expect(request.requestedAt).toEqual(NOW);
    expect(request.settledAt).toBeUndefined();
  });

  it("refuses an amount that is not positive", () => {
    // A zero or negative deposit is not a deposit; it would sit in the
    // treasury queue as noise.
    expect(() => requested(0n)).toThrow(InvalidFundingAmountError);
    expect(() => requested(-1n)).toThrow(InvalidFundingAmountError);
  });

  it("refuses a blank reference", () => {
    // The reference is the only link between a bank line and this request.
    expect(() =>
      FundingRequest.open({
        id: "fund-1",
        investorId: "inv-1",
        amountRial: 1n,
        reference: "   ",
        now: NOW,
      }),
    ).toThrow(InvalidFundingReferenceError);
  });
});

describe("FundingRequest — confirmation", () => {
  it("records what was actually received, not what was promised", () => {
    // Banks credit what the person actually sent. Crediting the declared
    // amount would put the ledger out of step with the bank statement.
    const confirmed = requested().confirm({ receivedRial: 49_950_000n, now: LATER });

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.settledAmountRial).toBe(49_950_000n);
    expect(confirmed.amountRial).toBe(50_000_000n); // what was declared, kept for the record
    expect(confirmed.settledAt).toEqual(LATER);
  });

  it("refuses to confirm a receipt that is not positive", () => {
    expect(() => requested().confirm({ receivedRial: 0n, now: LATER })).toThrow(
      InvalidFundingAmountError,
    );
  });

  it("cannot be confirmed twice, so a deposit cannot be credited twice", () => {
    const confirmed = requested().confirm({ receivedRial: 50_000_000n, now: LATER });

    expect(() => confirmed.confirm({ receivedRial: 50_000_000n, now: LATER })).toThrow(
      InvalidFundingTransitionError,
    );
  });
});

describe("FundingRequest — rejection", () => {
  it("records why, so the investor is not left guessing", () => {
    const rejected = requested().reject({ reason: "no matching bank credit found", now: LATER });

    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("no matching bank credit found");
    expect(rejected.settledAt).toEqual(LATER);
  });

  it("requires a reason", () => {
    expect(() => requested().reject({ reason: "  ", now: LATER })).toThrow(
      MissingRejectionReasonError,
    );
  });

  it("cannot reject something already confirmed", () => {
    const confirmed = requested().confirm({ receivedRial: 1n, now: LATER });
    expect(() => confirmed.reject({ reason: "changed my mind", now: LATER })).toThrow(
      InvalidFundingTransitionError,
    );
  });
});

describe("FundingRequest — cancellation", () => {
  it("lets the investor withdraw a request they have not paid", () => {
    const cancelled = requested().cancel(LATER);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.settledAt).toEqual(LATER);
  });

  it("cannot cancel once treasury has settled it either way", () => {
    // The money has already moved; withdrawing the request would hide it.
    const confirmed = requested().confirm({ receivedRial: 1n, now: LATER });
    expect(() => confirmed.cancel(LATER)).toThrow(InvalidFundingTransitionError);

    const rejected = requested().reject({ reason: "nothing arrived", now: LATER });
    expect(() => rejected.cancel(LATER)).toThrow(InvalidFundingTransitionError);
  });
});

describe("FundingRequest — persistence seam", () => {
  it("round-trips through restore", () => {
    const confirmed = requested().confirm({ receivedRial: 49_950_000n, now: LATER });

    const restored = FundingRequest.restore({
      id: confirmed.id,
      investorId: confirmed.investorId,
      amountRial: confirmed.amountRial,
      reference: confirmed.reference,
      status: confirmed.status,
      requestedAt: confirmed.requestedAt,
      // exactOptionalPropertyTypes: omit rather than pass undefined.
      ...(confirmed.settledAt !== undefined ? { settledAt: confirmed.settledAt } : {}),
      ...(confirmed.settledAmountRial !== undefined
        ? { settledAmountRial: confirmed.settledAmountRial }
        : {}),
    });

    expect(restored.status).toBe("confirmed");
    expect(restored.settledAmountRial).toBe(49_950_000n);
    // A restored terminal request is still terminal.
    expect(() => restored.confirm({ receivedRial: 1n, now: LATER })).toThrow(
      InvalidFundingTransitionError,
    );
  });
});
